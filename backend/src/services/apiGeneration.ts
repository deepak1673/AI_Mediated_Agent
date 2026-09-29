// Deterministic half of API generation (doc §22/§103): data-access governance, plan
// validation against the Data Catalog, and registry creation. No LLM in this file — the
// agent only proposes a structured plan; everything that decides what runs lives here.
import { prisma } from "../lib/prisma.js";
import { pgPool } from "../lib/pg.js";
import { compileQueryPlan, MissingParameterError, type QueryPlan } from "../lib/queryPlan.js";
import { evaluateGovernance, type PolicyRow } from "./governance.js";
import { logAudit } from "./audit.js";
import { DWH_ADMIN_ROLE } from "./apiRuntime.js";
import { withLock } from "../lib/keyedMutex.js";

const CLASS_RANK: Record<string, number> = { PUBLIC: 0, INTERNAL: 1, FINANCIAL: 2, PII: 2, CONFIDENTIAL: 3, RESTRICTED: 4 };
const maxClass = (a: string, b: string) => ((CLASS_RANK[b] ?? 99) > (CLASS_RANK[a] ?? 99) ? b : a);

export interface DiscoveredAsset {
  id: string;
  schema_name: string;
  table_name: string;
  columns: string[];
}

export interface AgentPlan {
  name: string;
  description: string;
  slug: string;
  metric: string;
  dimensions: string[];
  table: string;
  table_alias: string;
  joins: { table: string; alias: string; left: string; right: string }[];
  select: { column: string; alias: string; agg: string }[];
  filters: { column: string; op: "eq" | "gte" | "lte" | "in"; param: string; required: boolean }[];
  group_by: string[];
  order_by: { column: string; direction: "asc" | "desc" }[];
  limit: number;
  parameters: { name: string; type: string; required: boolean; description: string }[];
}

export class PlanValidationError extends Error {
  constructor(public problems: string[]) {
    super(`Plan validation failed: ${problems.join("; ")}`);
  }
}

async function loadPolicies(): Promise<PolicyRow[]> {
  const rows = await prisma.policy.findMany();
  return rows.map((r) => ({
    id: r.id,
    resourceType: r.resourceType,
    resourceMatch: r.resourceMatch as Record<string, unknown>,
    role: r.role,
    team: r.team,
    action: r.action,
    decision: r.decision,
    hitlType: r.hitlType,
    reason: r.reason,
  }));
}

export type DataAccessOutcome =
  | { kind: "allowed" }
  | { kind: "hitl_pending"; hitlRequestId: string; reason: string }
  | { kind: "denied"; reason: string };

/**
 * Data-access governance for the discovered assets (doc §10). The classification evaluated per
 * asset is the highest among the columns actually needed — asking for non-PII columns of a
 * PII-tagged table must not trigger a PII approval.
 */
export async function checkDataAccess(
  assets: DiscoveredAsset[],
  user: { id: string; role: string; team: string },
  workflowRunId: string,
): Promise<DataAccessOutcome> {
  const policies = await loadPolicies();
  const cols = await prisma.dataColumn.findMany({ where: { assetId: { in: assets.map((a) => a.id) } } });

  const needsApproval: { assetId: string; table: string; columns: string[]; classification: string; reason: string }[] = [];
  for (const asset of assets) {
    const classification = cols
      .filter((c) => c.assetId === asset.id && asset.columns.includes(c.columnName))
      .reduce((acc, c) => maxClass(acc, c.classification), "PUBLIC");
    const table = `${asset.schema_name}.${asset.table_name}`;
    const decision = evaluateGovernance(
      { resourceType: "data_asset", resourceId: asset.id, classification, action: "read" },
      { role: user.role, team: user.team },
      policies,
    );
    await logAudit({
      requestId: workflowRunId, actorId: user.id, action: "DATA_ACCESS_CHECK",
      resource: table, decision: decision.decision, metadata: { classification, matchedPolicyId: decision.matchedPolicyId },
    });
    if (decision.decision === "HARD_DENY") return { kind: "denied", reason: `${table}: ${decision.reason}` };
    if (decision.decision === "HITL_REQUIRED") {
      needsApproval.push({ assetId: asset.id, table, columns: [...asset.columns].sort(), classification, reason: decision.reason });
    }
  }
  if (needsApproval.length === 0) return { kind: "allowed" };

  // The approval is scoped to the exact columns requested, so approving some columns of a table never
  // silently covers a later request for other columns of the same table.
  const assetKey = needsApproval.map((a) => `${a.assetId}:${a.columns.join("+")}`).sort().join(",");
  const approved = await prisma.hitlRequest.findFirst({
    where: {
      requesterId: user.id, hitlType: "HITL_DATA_ACCESS", status: "APPROVED",
      requestedResource: { path: ["assetKey"], equals: assetKey },
    },
  });
  if (approved) return { kind: "allowed" };

  const reason = needsApproval.map((a) => `${a.table} (${a.classification}): ${a.reason}`).join(" ");
  const hitl = await withLock(`data-hitl:${user.id}:${assetKey}`, async () => {
    const pending = await prisma.hitlRequest.findFirst({
      where: {
        requesterId: user.id, hitlType: "HITL_DATA_ACCESS", status: "PENDING",
        requestedResource: { path: ["assetKey"], equals: assetKey },
      },
    });
    return (
      pending ??
      (await prisma.hitlRequest.create({
      data: {
        workflowRunId, hitlType: "HITL_DATA_ACCESS", requesterId: user.id, approverRole: DWH_ADMIN_ROLE, reason,
        requestedResource: {
          assetKey,
          path: needsApproval.map((a) => a.table).join(", "),
          classification: needsApproval.reduce((acc, a) => maxClass(acc, a.classification), "PUBLIC"),
          assets: needsApproval.map((a) => ({ table: a.table, classification: a.classification, columns: a.columns })) },
        status: "PENDING",
      },
    }))
    );
  });
  await logAudit({
    requestId: workflowRunId, actorId: user.id, action: "HITL_CREATED", resource: assetKey,
    decision: "HITL_REQUIRED", metadata: { hitlRequestId: hitl.id, hitlType: "HITL_DATA_ACCESS" },
  });
  return { kind: "hitl_pending", hitlRequestId: hitl.id, reason };
}

export interface ValidatedApi {
  queryPlan: QueryPlan;
  classification: string;
  parameters: AgentPlan["parameters"];
  responseSchema: Record<string, unknown>;
  slug: string;
}

/** Validates an agent-proposed plan against the catalog, compiles it, and EXPLAINs the SQL. */
export async function validatePlan(plan: AgentPlan, cleared?: DiscoveredAsset[]): Promise<ValidatedApi> {
  const problems: string[] = [];
  const catalog = await prisma.dataAsset.findMany({ include: { columns: true } });

  const tables = [{ table: plan.table, alias: plan.table_alias }, ...plan.joins.map((j) => ({ table: j.table, alias: j.alias }))];
  const aliasCols = new Map<string, Map<string, string>>(); // alias -> column -> classification
  for (const t of tables) {
    const [schema, name] = t.table.split(".");
    const asset = catalog.find((a) => a.schemaName === schema && a.tableName === name);
    if (!asset) problems.push(`Unknown table ${t.table}`);
    else if (!asset.inWarehouse) problems.push(`Table ${t.table} is not in the warehouse`);
    else if (schema !== "warehouse") problems.push(`Only warehouse tables may be queried (got ${t.table})`);
    if (aliasCols.has(t.alias)) problems.push(`Duplicate alias ${t.alias}`);
    aliasCols.set(t.alias, new Map((asset?.columns ?? []).map((c) => [c.columnName, c.classification])));
  }

  // Columns that data discovery named and data-access governance evaluated. A plan may not use any other
  // column, even one that exists in the catalog: that would bypass the access check done for this request.
  const clearedCols = cleared
    ? new Map(cleared.map((a) => [`${a.schema_name}.${a.table_name}`, new Set(a.columns)]))
    : null;
  const aliasTable = new Map(tables.map((t) => [t.alias, t.table]));

  let classification = "PUBLIC";
  const useColumn = (ref: string, where: string) => {
    const [alias, col] = ref.split(".");
    const cls = aliasCols.get(alias)?.get(col);
    if (cls === undefined) {
      problems.push(`${where}: unknown column ${ref}`);
      return;
    }
    const table = aliasTable.get(alias);
    if (clearedCols && table && !clearedCols.get(table)?.has(col)) {
      problems.push(`${where}: column ${ref} was not cleared for this request; use only the columns listed as available`);
      return;
    }
    classification = maxClass(classification, cls);
  };

  for (const j of plan.joins) {
    useColumn(j.left, "join");
    useColumn(j.right, "join");
    // A join on unrelated columns (e.g. quantity = customer_key) runs fine but returns wrong data.
    const l = j.left.split(".")[1] ?? "";
    const r = j.right.split(".")[1] ?? "";
    const keyLike = (c: string) => /_(key|id)$/.test(c);
    if (l !== r && !(keyLike(l) && keyLike(r))) problems.push(`join: ${j.left} = ${j.right} does not join on matching key columns`);
  }
  for (const s of plan.select) useColumn(s.column, "select");
  for (const f of plan.filters) useColumn(f.column, "filter");
  for (const g of plan.group_by) useColumn(g, "group by");
  const outputAliases = new Set(plan.select.map((f) => f.alias));
  for (const o of plan.order_by) {
    if (!outputAliases.has(o.column)) useColumn(o.column, "order by");
  }

  const declared = new Set(plan.parameters.map((p) => p.name));
  for (const f of plan.filters) {
    if (!declared.has(f.param)) problems.push(`Filter uses undeclared parameter ${f.param}`);
  }
  for (const p of plan.parameters) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(p.name)) problems.push(`Invalid parameter name ${p.name}`);
  }
  const hasAgg = plan.select.some((s) => s.agg !== "none");
  if (hasAgg) {
    const plain = plan.select.filter((s) => s.agg === "none").map((s) => s.column);
    for (const c of plain) if (!plan.group_by.includes(c)) problems.push(`${c} must be in group_by when aggregating`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plan.slug)) problems.push(`Invalid slug "${plan.slug}"`);
  if (classification === "RESTRICTED") problems.push("Plan touches RESTRICTED columns");
  if (problems.length > 0) throw new PlanValidationError(problems);

  const queryPlan: QueryPlan = {
    table: plan.table,
    alias: plan.table_alias,
    joins: plan.joins.map((j) => ({ table: j.table, alias: j.alias, on: { left: j.left, right: j.right } })),
    select: plan.select.map((s) => ({
      column: s.column,
      as: s.alias,
      ...(s.agg !== "none" ? { agg: s.agg as "sum" | "count" | "avg" | "min" | "max" } : {}),
    })),
    filters: plan.filters,
    groupBy: plan.group_by.length ? plan.group_by : undefined,
    orderBy: plan.order_by.length ? plan.order_by : undefined,
    limit: Math.min(Math.max(plan.limit || 500, 1), 2000),
  };

  // Dry-run: compile with every filter param unset (required ones are skipped) and EXPLAIN it.
  try {
    const dry: QueryPlan = { ...queryPlan, filters: (queryPlan.filters ?? []).map((f) => ({ ...f, required: false })) };
    const { sql, values } = compileQueryPlan(dry, {});
    await pgPool.query(`EXPLAIN ${sql}`, values);
  } catch (err) {
    if (err instanceof MissingParameterError) throw err;
    throw new PlanValidationError([`SQL dry-run failed: ${(err as Error).message}`]);
  }

  return {
    queryPlan,
    classification,
    parameters: plan.parameters,
    responseSchema: { type: "array", items: Object.fromEntries(plan.select.map((s) => [s.alias, "any"])) },
    slug: plan.slug,
  };
}

/** Registers the validated API. Reuses an identical existing plan instead of duplicating (doc §103). */
export function registerApi(plan: AgentPlan, v: ValidatedApi, owner: { id: string; team: string }, runId: string) {
  // One registration at a time: the duplicate check and the unique-path suffix loop are check-then-write.
  return withLock("register-api", () => registerApiLocked(plan, v, owner, runId));
}

async function registerApiLocked(plan: AgentPlan, v: ValidatedApi, owner: { id: string; team: string }, runId: string) {
  const existing = await prisma.apiRegistryEntry.findMany({ where: { status: "ACTIVE" } });
  const planJson = JSON.stringify(v.queryPlan);
  const dup = existing.find((e) => JSON.stringify(e.queryPlan) === planJson);
  if (dup) return { entry: dup, created: false };

  let path = `/api/generated/${v.slug}`;
  for (let i = 2; await prisma.apiRegistryEntry.findUnique({ where: { path } }); i++) {
    path = `/api/generated/${v.slug}-${i}`;
  }
  const entry = await prisma.apiRegistryEntry.create({
    data: {
      name: plan.name,
      description: plan.description,
      path,
      metric: plan.metric,
      dimensions: plan.dimensions,
      filterKeys: v.parameters.map((p) => p.name),
      classification: v.classification,
      ownerTeam: owner.team,
      queryPlan: v.queryPlan as object,
      parameters: v.parameters,
      responseSchema: v.responseSchema as object,
    },
  });
  await logAudit({
    requestId: runId, actorId: owner.id, action: "API_REGISTERED", resource: path,
    decision: "ALLOW", metadata: { classification: v.classification, apiId: entry.id },
  });
  return { entry, created: true };
}
