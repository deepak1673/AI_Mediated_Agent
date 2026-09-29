// Mock ETL (doc §101): copies a source-system table into the warehouse schema and registers it in
// the Data Catalog. Deterministic — no LLM. Steps are recorded on the run so the UI can show the
// Requested → Approved → Running → Completed → Warehouse Updated timeline.
import { prisma } from "../lib/prisma.js";
import { pgPool } from "../lib/pg.js";
import { logAudit } from "./audit.js";
import { DWH_ADMIN_ROLE } from "./apiRuntime.js";
import { withLock } from "../lib/keyedMutex.js";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const STALE_MS = Number(process.env.ETL_STALE_MINUTES ?? 5) * 60_000;
const STEP_DELAY_MS = Number(process.env.MOCK_ETL_STEP_MS ?? 1500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EtlEvent {
  at: string;
  step: string;
  detail?: string;
}

export async function recordStep(runId: string, status: string | null, step: string, detail?: string) {
  const run = await prisma.etlRun.findUniqueOrThrow({ where: { id: runId } });
  const events = [...((run.events as unknown as EtlEvent[]) ?? []), { at: new Date().toISOString(), step, detail }];
  await prisma.etlRun.update({
    where: { id: runId },
    data: { events: events as unknown as object, ...(status ? { status } : {}) },
  });
}

/** Runs an approved ETL run to completion. Never throws: failures are recorded on the run. */
export async function runEtl(runId: string): Promise<void> {
  const run = await prisma.etlRun.findUniqueOrThrow({ where: { id: runId }, include: { pipeline: true } });
  const { pipeline } = run;
  try {
    for (const id of [pipeline.sourceSchema, pipeline.sourceTable, pipeline.targetTable]) {
      if (!IDENT.test(id)) throw new Error(`Unsafe identifier in pipeline: ${id}`);
    }
    // Claim the run atomically: only one caller may move APPROVED -> RUNNING, so a duplicate trigger is a no-op.
    const claimed = await prisma.etlRun.updateMany({ where: { id: runId, status: "APPROVED" }, data: { status: "RUNNING" } });
    if (claimed.count === 0) return;
    await recordStep(runId, null, "ETL Running", `${pipeline.sourceSchema}.${pipeline.sourceTable} → warehouse.${pipeline.targetTable}`);
    await sleep(STEP_DELAY_MS);

    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS warehouse.${pipeline.targetTable} AS SELECT * FROM ${pipeline.sourceSchema}.${pipeline.sourceTable}`,
    );
    const count = await pgPool.query(`SELECT count(*)::int AS n FROM warehouse.${pipeline.targetTable}`);
    const rows = count.rows[0].n as number;
    await prisma.etlRun.update({ where: { id: runId }, data: { rowsLoaded: rows } });
    await recordStep(runId, "COMPLETED", "ETL Completed", `${rows} rows loaded`);
    await sleep(STEP_DELAY_MS);

    // Warehouse Updated: register the new table in the Data Catalog, inheriting source metadata.
    const source = await prisma.dataAsset.findUnique({
      where: { schemaName_tableName: { schemaName: pipeline.sourceSchema, tableName: pipeline.sourceTable } },
      include: { columns: true },
    });
    if (!source) throw new Error("Source asset missing from the Data Catalog");
    const target = await prisma.dataAsset.upsert({
      where: { schemaName_tableName: { schemaName: "warehouse", tableName: pipeline.targetTable } },
      update: { inWarehouse: true },
      create: {
        schemaName: "warehouse",
        tableName: pipeline.targetTable,
        description: source.description,
        owner: source.owner,
        classification: source.classification,
        inWarehouse: true,
        sourceSystem: `${pipeline.sourceSchema}.${pipeline.sourceTable}`,
      },
    });
    for (const c of source.columns) {
      await prisma.dataColumn.upsert({
        where: { assetId_columnName: { assetId: target.id, columnName: c.columnName } },
        update: {},
        create: {
          assetId: target.id,
          columnName: c.columnName,
          dataType: c.dataType,
          description: c.description,
          classification: c.classification,
          synonyms: c.synonyms as object,
        },
      });
    }
    await recordStep(runId, null, "Warehouse Updated", `warehouse.${pipeline.targetTable} is now in the Data Catalog`);
    await logAudit({
      actorId: run.requesterId, action: "ETL_COMPLETED", resource: `warehouse.${pipeline.targetTable}`,
      decision: "ALLOW", metadata: { etlRunId: runId, rows },
    });
  } catch (err) {
    await prisma.etlRun.update({ where: { id: runId }, data: { error: String(err) } });
    await recordStep(runId, "FAILED", "ETL Failed", String(err));
    await logAudit({
      actorId: run.requesterId, action: "ETL_FAILED", resource: pipeline.targetTable,
      decision: "DENY", metadata: { etlRunId: runId, error: String(err) },
    });
  }
}

export interface EtlSummary {
  runId: string;
  pipeline: string;
  status: string;
  events: EtlEvent[];
}

export type EtlOutcome =
  | { kind: "no_pipeline"; tables: string[] }
  | { kind: "ready" } // every needed table has already been loaded into the warehouse
  | { kind: "hitl_pending"; hitlRequestId: string; reason: string; etl: EtlSummary }
  | { kind: "running"; etl: EtlSummary }
  | { kind: "rejected"; reason: string; etl: EtlSummary };

const summarize = (run: { id: string; status: string; events: unknown }, pipeline: string): EtlSummary => ({
  runId: run.id,
  pipeline,
  status: run.status,
  events: (run.events as EtlEvent[]) ?? [],
});

/**
 * Source discovery + ETL gate (doc §11). For source-only tables: no pipeline -> stop; otherwise the
 * pipeline's latest run decides — loaded, running, awaiting approval, or a fresh HITL_ETL_EXECUTION.
 */
export async function resolveEtl(
  sources: { schema_name: string; table_name: string }[],
  user: { id: string },
  workflowRunId: string,
): Promise<EtlOutcome> {
  const pipelines = await prisma.etlPipeline.findMany({
    where: { OR: sources.map((s) => ({ sourceSchema: s.schema_name, sourceTable: s.table_name })) },
  });
  const missing = sources.filter((s) => !pipelines.some((p) => p.sourceSchema === s.schema_name && p.sourceTable === s.table_name));
  if (missing.length > 0) {
    await logAudit({
      requestId: workflowRunId, actorId: user.id, action: "ETL_NO_PIPELINE",
      decision: "STOP", metadata: { tables: missing.map((m) => `${m.schema_name}.${m.table_name}`) },
    });
    return { kind: "no_pipeline", tables: missing.map((m) => `${m.schema_name}.${m.table_name}`) };
  }

  for (const pipeline of pipelines) {
    let latest = await prisma.etlRun.findFirst({ where: { pipelineId: pipeline.id }, orderBy: { createdAt: "desc" } });
    // The ETL runs in-process; if the server restarted mid-run it would look RUNNING forever. Give up on
    // runs with no progress for a while and ask for a fresh approval instead of leaving the user stuck.
    if (latest && (latest.status === "RUNNING" || latest.status === "APPROVED") && Date.now() - latest.updatedAt.getTime() > STALE_MS) {
      await recordStep(latest.id, "FAILED", "ETL Failed", "Interrupted: no progress (the server may have restarted). A new approval is needed.");
      latest = null;
    }
    if (latest?.status === "COMPLETED") continue;
    if (latest && (latest.status === "RUNNING" || latest.status === "APPROVED")) {
      return { kind: "running", etl: summarize(latest, pipeline.name) };
    }
    if (latest?.status === "REQUESTED") {
      const hitl = latest.hitlRequestId ? await prisma.hitlRequest.findUnique({ where: { id: latest.hitlRequestId } }) : null;
      return { kind: "hitl_pending", hitlRequestId: latest.hitlRequestId ?? "", reason: hitl?.reason ?? "ETL awaiting approval.", etl: summarize(latest, pipeline.name) };
    }
    if (latest?.status === "REJECTED" && latest.requesterId === user.id) {
      return { kind: "rejected", reason: "An administrator rejected the ETL for this data.", etl: summarize(latest, pipeline.name) };
    }

    return withLock(`etl:${pipeline.id}`, async (): Promise<EtlOutcome> => {
      // Re-check under the lock: a concurrent request may just have created the approval.
      const raced = await prisma.etlRun.findFirst({ where: { pipelineId: pipeline.id, status: "REQUESTED" }, orderBy: { createdAt: "desc" } });
      if (raced) {
        const h = raced.hitlRequestId ? await prisma.hitlRequest.findUnique({ where: { id: raced.hitlRequestId } }) : null;
        return { kind: "hitl_pending", hitlRequestId: raced.hitlRequestId ?? "", reason: h?.reason ?? "ETL awaiting approval.", etl: summarize(raced, pipeline.name) };
      }
      const reason = `The data you need (${pipeline.sourceSchema}.${pipeline.sourceTable}) is not in the warehouse. Approve running "${pipeline.name}" to load it.`;
      const hitl = await prisma.hitlRequest.create({
        data: {
          workflowRunId, hitlType: "HITL_ETL_EXECUTION", requesterId: user.id, approverRole: DWH_ADMIN_ROLE, reason,
          requestedResource: {
            pipelineId: pipeline.id, path: `${pipeline.sourceSchema}.${pipeline.sourceTable} → warehouse.${pipeline.targetTable}`,
            classification: "ETL",
          },
          status: "PENDING",
        },
      });
      const run = await prisma.etlRun.create({
        data: {
          pipelineId: pipeline.id, hitlRequestId: hitl.id, requesterId: user.id, status: "REQUESTED",
          events: [{ at: new Date().toISOString(), step: "ETL Requested", detail: pipeline.name }] as unknown as object,
        },
      });
      await logAudit({
        requestId: workflowRunId, actorId: user.id, action: "HITL_CREATED", resource: pipeline.name,
        decision: "HITL_REQUIRED", metadata: { hitlRequestId: hitl.id, hitlType: "HITL_ETL_EXECUTION", etlRunId: run.id },
      });
      return { kind: "hitl_pending", hitlRequestId: hitl.id, reason, etl: summarize(run, pipeline.name) };

    });
  }
  return { kind: "ready" };
}
