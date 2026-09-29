import { prisma } from "../lib/prisma.js";
import { pgPool } from "../lib/pg.js";
import { compileQueryPlan, MissingParameterError, referencedColumns, type QueryPlan } from "../lib/queryPlan.js";
import { withLock } from "../lib/keyedMutex.js";
import { evaluateGovernance, type PolicyRow } from "./governance.js";
import { logAudit } from "./audit.js";

export const DWH_ADMIN_ROLE = "DWH_ADMIN";

export interface InvokeContext {
  userId: string;
  role: string;
  team: string;
}

export type InvokeOutcome =
  | { kind: "success"; rows: unknown[] }
  | { kind: "hitl_pending"; hitlRequestId: string; reason: string }
  | { kind: "denied"; reason: string }
  | { kind: "missing_parameter"; param: string };

const UNRESTRICTED = new Set(["PUBLIC", "INTERNAL"]);

/**
 * True when an admin-approved HITL_DATA_ACCESS request already covers everything sensitive this API
 * touches, so a second (API-access) approval would only repeat the same decision.
 *
 * "Covers" is exact and column-scoped: every restricted column the API reads (anything beyond
 * PUBLIC/INTERNAL) must be one of the columns named in one of the user's approved requests. Table or
 * classification level coverage is deliberately not enough: FINANCIAL, PII and CONFIDENTIAL are different
 * categories, and approving some columns of a table says nothing about other columns of it.
 */
export async function coveredByDataApproval(entry: { queryPlan: unknown }, userId: string): Promise<boolean> {
  const plan = entry.queryPlan as QueryPlan;
  const aliasToTable = new Map<string, string>([[plan.alias, plan.table]]);
  plan.joins?.forEach((j) => aliasToTable.set(j.alias, j.table));

  const catalog = await prisma.dataAsset.findMany({ include: { columns: true } });
  const classOf = new Map<string, string>();
  for (const a of catalog) for (const c of a.columns) classOf.set(`${a.schemaName}.${a.tableName}.${c.columnName}`, c.classification);

  const restricted = new Set<string>();
  for (const ref of referencedColumns(plan)) {
    const [alias, col] = ref.split(".");
    const table = aliasToTable.get(alias);
    if (!table) return false;
    const key = `${table}.${col}`;
    const cls = classOf.get(key);
    if (cls === undefined || !UNRESTRICTED.has(cls)) restricted.add(key); // unknown columns count as restricted
  }
  if (restricted.size === 0) return false; // nothing to attribute to a data approval

  const approvals = await prisma.hitlRequest.findMany({
    where: { requesterId: userId, hitlType: "HITL_DATA_ACCESS", status: "APPROVED" },
  });
  const approved = new Set<string>();
  for (const a of approvals) {
    const res = a.requestedResource as { assets?: { table: string; columns?: string[] }[] };
    for (const asset of res.assets ?? []) for (const c of asset.columns ?? []) approved.add(`${asset.table}.${c}`);
  }
  return [...restricted].every((k) => approved.has(k));
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

/**
 * Existing-API invocation path (doc §8): governance decides ALLOW / HITL_REQUIRED / HARD_DENY.
 * HITL_REQUIRED re-uses any prior APPROVED request for this user+API; otherwise it opens a new
 * one and returns "pending" — no LangGraph involved, this is the synchronous non-agentic path.
 */
export async function invokeRegisteredApi(
  entry: {
    id: string;
    path: string;
    status?: string;
    classification: string;
    queryPlan: unknown;
  },
  params: Record<string, string | undefined>,
  ctx: InvokeContext,
): Promise<InvokeOutcome> {
  const policies = await loadPolicies();
  const decision = evaluateGovernance(
    { resourceType: "api", resourceId: entry.id, classification: entry.classification, action: "read" },
    { role: ctx.role, team: ctx.team },
    policies,
  );

  await logAudit({
    actorId: ctx.userId,
    action: "API_INVOKE_ATTEMPT",
    resource: entry.path,
    decision: decision.decision,
    metadata: { matchedPolicyId: decision.matchedPolicyId },
  });

  if (decision.decision === "HARD_DENY") {
    await logAudit({ actorId: ctx.userId, action: "API_INVOKE", resource: entry.path, decision: "HARD_DENY" });
    return { kind: "denied", reason: decision.reason };
  }

  if (decision.decision === "HITL_REQUIRED") {
    const approved = await prisma.hitlRequest.findFirst({
      where: {
        requesterId: ctx.userId,
        hitlType: decision.hitlType ?? "HITL_API_ACCESS",
        status: "APPROVED",
        requestedResource: { path: ["apiId"], equals: entry.id },
      },
    });
    if (!approved && !(await coveredByDataApproval(entry, ctx.userId))) {
      const hitl = await withLock(`api-hitl:${ctx.userId}:${entry.id}`, async () => {
        const pending = await prisma.hitlRequest.findFirst({
          where: { requesterId: ctx.userId, status: "PENDING", requestedResource: { path: ["apiId"], equals: entry.id } },
        });
        return (
          pending ??
          (await prisma.hitlRequest.create({
            data: {
              workflowRunId: `direct-${entry.id}`,
              hitlType: decision.hitlType ?? "HITL_API_ACCESS",
              requesterId: ctx.userId,
              approverRole: DWH_ADMIN_ROLE,
              reason: decision.reason,
              requestedResource: { apiId: entry.id, path: entry.path, classification: entry.classification },
              status: "PENDING",
            },
          }))
        );
      });
      await logAudit({ actorId: ctx.userId, action: "HITL_CREATED", resource: entry.path, decision: "HITL_REQUIRED", metadata: { hitlRequestId: hitl.id } });
      return { kind: "hitl_pending", hitlRequestId: hitl.id, reason: decision.reason };
    }
  }

  try {
    const { sql, values } = compileQueryPlan(entry.queryPlan as QueryPlan, params);
    const result = await pgPool.query(sql, values);
    await prisma.apiRegistryEntry.update({
      where: { id: entry.id },
      // A call proves the API works, so an UNUSED API is active again.
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date(), ...(entry.status === "UNUSED" ? { status: "ACTIVE" } : {}) },
    });
    await logAudit({ actorId: ctx.userId, action: "API_INVOKE", resource: entry.path, decision: "ALLOW" });
    return { kind: "success", rows: result.rows };
  } catch (err) {
    if (err instanceof MissingParameterError) {
      return { kind: "missing_parameter", param: err.param };
    }
    throw err;
  }
}
