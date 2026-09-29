// Lifecycle analysis (doc §105). Detection is deterministic and evidence-based; the Lifecycle Agent
// (LLM, in agent-service) only turns that evidence into readable wording and picks the priority.
// The model can neither add nor drop findings: they are merged back onto the deterministic list.
import { prisma } from "../lib/prisma.js";
import { pgPool } from "../lib/pg.js";
import { logAudit } from "./audit.js";
import { referencedColumns, type QueryPlan } from "../lib/queryPlan.js";

export type IssueType = "UNUSED" | "BROKEN" | "DANGLING" | "DEPRECATED";
export type Severity = "high" | "medium" | "low";

export interface LifecycleFinding {
  apiId: string;
  apiName: string;
  apiPath: string;
  issueType: IssueType;
  severity: Severity;
  evidence: string;
  usageCount: number;
  lastUsedAt: string | null;
  explanation?: string;
  suggestedAction?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "dev-internal-token";
export const DEFAULT_PERIOD_DAYS = Number(process.env.LIFECYCLE_PERIOD_DAYS ?? 30);

export async function detectFindings(periodDays = DEFAULT_PERIOD_DAYS): Promise<LifecycleFinding[]> {
  const cutoff = new Date(Date.now() - periodDays * 86_400_000);
  const apis = await prisma.apiRegistryEntry.findMany({ orderBy: { name: "asc" } });
  const catalog = await prisma.dataAsset.findMany();

  const phys = await pgPool.query(
    `SELECT table_schema, table_name, column_name FROM information_schema.columns
     WHERE table_schema IN ('warehouse','crm','erp','maintenance')`,
  );
  const physical = new Map<string, Set<string>>(); // "schema.table" -> columns
  for (const r of phys.rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!physical.has(key)) physical.set(key, new Set());
    physical.get(key)!.add(r.column_name);
  }

  const findings: LifecycleFinding[] = [];
  for (const api of apis) {
    const base = {
      apiId: api.id, apiName: api.name, apiPath: api.path, usageCount: api.usageCount,
      lastUsedAt: api.lastUsedAt?.toISOString() ?? null,
    };
    const plan = api.queryPlan as unknown as QueryPlan;

    // Dependency checks: does every table/column the plan touches still exist, and is it catalogued?
    const aliasToTable = new Map<string, string>([[plan.alias, plan.table]]);
    plan.joins?.forEach((j) => aliasToTable.set(j.alias, j.table));
    const missingTables = [...new Set(aliasToTable.values())].filter((t) => !physical.has(t));
    const missingColumns: string[] = [];
    for (const ref of referencedColumns(plan)) {
      const [alias, col] = ref.split(".");
      const table = aliasToTable.get(alias);
      if (table && physical.has(table) && !physical.get(table)!.has(col)) missingColumns.push(`${table}.${col}`);
    }
    if (missingTables.length || missingColumns.length) {
      findings.push({
        ...base, issueType: "BROKEN", severity: "high",
        evidence: [
          missingTables.length ? `Missing table(s): ${missingTables.join(", ")}` : "",
          missingColumns.length ? `Missing column(s): ${missingColumns.join(", ")}` : "",
        ].filter(Boolean).join("; "),
      });
    } else {
      const uncatalogued = [...new Set(aliasToTable.values())].filter((t) => {
        const [schema, name] = t.split(".");
        return !catalog.some((a) => a.schemaName === schema && a.tableName === name && a.inWarehouse);
      });
      if (uncatalogued.length) {
        findings.push({
          ...base, issueType: "DANGLING", severity: "high",
          evidence: `References data asset(s) not available in the Data Catalog: ${uncatalogued.join(", ")}`,
        });
      }
    }

    if (api.status === "DEPRECATED") {
      findings.push({
        ...base, issueType: "DEPRECATED", severity: api.usageCount > 0 ? "medium" : "low",
        evidence: `Version ${api.version} is marked DEPRECATED; ${api.usageCount} historical call(s).`,
      });
    } else {
      const lastActivity = api.lastUsedAt ?? api.createdAt;
      if (lastActivity < cutoff) {
        const idle = Math.floor((Date.now() - lastActivity.getTime()) / 86_400_000);
        findings.push({
          ...base, issueType: "UNUSED", severity: "medium",
          evidence: `No usage recorded during the ${periodDays}-day analysis period (idle ${idle} days; ${api.usageCount} lifetime call(s)).`,
        });
      }
    }
  }
  return findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.apiName.localeCompare(b.apiName));
}

interface AgentReport {
  summary: string;
  priority_api_name: string;
  priority_reason: string;
  findings: { api_name: string; issue_type: string; explanation: string; suggested_action: string }[];
}

const FALLBACK_ACTION: Record<IssueType, string> = {
  UNUSED: "Confirm with the owning team whether the API is still needed; retire it if not.",
  BROKEN: "Restore the missing dependency or fix the query plan, then re-validate the API.",
  DANGLING: "Register the referenced data asset in the Data Catalog or retire the API.",
  DEPRECATED: "Migrate remaining consumers to the replacement version, then remove this one.",
};

async function askAgent(findings: LifecycleFinding[], periodDays: number): Promise<AgentReport | null> {
  try {
    const resp = await fetch(`${AGENT_URL}/lifecycle`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": INTERNAL_TOKEN },
      body: JSON.stringify({
        period_days: periodDays,
        findings: findings.map((f) => ({
          api_name: f.apiName, issue_type: f.issueType, severity: f.severity, evidence: f.evidence, usage_count: f.usageCount,
        })),
      }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as AgentReport;
  } catch {
    return null;
  }
}

/** Runs the offline lifecycle review and stores it as a Report. */
export async function runLifecycleReview(actorId?: string, periodDays = DEFAULT_PERIOD_DAYS) {
  const findings = await detectFindings(periodDays);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 86_400_000);

  const counts = findings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.issueType]: (acc[f.issueType] ?? 0) + 1 }), {});
  const agent = findings.length > 0 ? await askAgent(findings, periodDays) : null;

  // Merge model wording onto the deterministic findings (matched by API + issue type only).
  const items = findings.map((f) => {
    const hit = agent?.findings.find((a) => a.api_name === f.apiName && a.issue_type === f.issueType);
    return { ...f, explanation: hit?.explanation || f.evidence, suggestedAction: hit?.suggested_action || FALLBACK_ACTION[f.issueType] };
  });
  const top = items[0];
  const knownPriority = agent && items.some((i) => i.apiName === agent.priority_api_name);
  const priority = top
    ? {
        apiName: knownPriority ? agent!.priority_api_name : top.apiName,
        reason: knownPriority ? agent!.priority_reason : top.evidence,
      }
    : null;
  const summary =
    findings.length === 0
      ? `All APIs are healthy: no unused, broken, dangling or deprecated APIs in the last ${periodDays} days.`
      : agent?.summary ||
        `${findings.length} finding(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ")}.`;

  const report = await prisma.report.create({
    data: {
      reportType: "API Lifecycle Review",
      periodStart,
      periodEnd,
      agent: agent ? "Lifecycle Agent" : "Lifecycle Agent (rule-based fallback)",
      summary,
      findings: { items, counts, priority, periodDays } as unknown as object,
      severity: items.reduce<Severity | "none">((acc, i) => (acc === "none" || SEVERITY_RANK[i.severity] > SEVERITY_RANK[acc] ? i.severity : acc), "none"),
      status: "NEW",
    },
  });

  // Lifecycle status changes: pull broken/unused APIs out of discovery (which only offers ACTIVE ones).
  for (const f of items) {
    const next = f.issueType === "BROKEN" || f.issueType === "DANGLING" ? "BROKEN" : f.issueType === "UNUSED" ? "UNUSED" : null;
    if (!next) continue;
    const api = await prisma.apiRegistryEntry.findUnique({ where: { id: f.apiId } });
    if (api && api.status === "ACTIVE") {
      await prisma.apiRegistryEntry.update({ where: { id: api.id }, data: { status: next } });
      await logAudit({ actorId, action: "API_STATUS_CHANGED", resource: api.path, decision: next, metadata: { reportId: report.id, from: "ACTIVE" } });
    }
  }
  // Recovery: an API previously marked BROKEN/UNUSED that no longer has any such finding is healthy again.
  const flagged = new Set(items.filter((f) => f.issueType !== "DEPRECATED").map((f) => f.apiId));
  const recovered = await prisma.apiRegistryEntry.findMany({ where: { status: { in: ["BROKEN", "UNUSED"] }, id: { notIn: [...flagged] } } });
  for (const api of recovered) {
    await prisma.apiRegistryEntry.update({ where: { id: api.id }, data: { status: "ACTIVE" } });
    await logAudit({ actorId, action: "API_STATUS_CHANGED", resource: api.path, decision: "ACTIVE", metadata: { reportId: report.id, from: api.status } });
  }
  await logAudit({ actorId, action: "LIFECYCLE_REPORT_CREATED", resource: report.id, decision: "ALLOW", metadata: { findings: findings.length } });
  return report;
}
