import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";
import { logAudit } from "../services/audit.js";
import { perUserRateLimit } from "../lib/rateLimit.js";
import { resolveEtl } from "../services/etl.js";
import {
  checkDataAccess,
  PlanValidationError,
  registerApi,
  validatePlan,
  type AgentPlan,
  type DiscoveredAsset,
} from "../services/apiGeneration.js";

export const askRouter = Router();

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "dev-internal-token";

interface Intent {
  summary: string;
  metric: string;
  dimensions: string[];
  filters: Record<string, string>;
}
interface AgentAnalysis {
  intent: Intent;
  discovery: { api_id: string | null; params: Record<string, string>; confidence: number; reasoning: string };
  api: { id: string; name: string; path: string; classification: string } | null;
}
interface AgentDiscovery {
  data_available: boolean;
  missing: string;
  reasoning: string;
  assets: (DiscoveredAsset & { classification: string; in_warehouse: boolean })[];
}

class AgentError extends Error {
  constructor(public httpStatus: number, detail: string) {
    super(`agent-service ${httpStatus}: ${detail}`);
  }
}

async function agentPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${AGENT_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": INTERNAL_TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.AGENT_TIMEOUT_MS ?? 180_000)),
  });
  if (!resp.ok) throw new AgentError(resp.status, await resp.text());
  return (await resp.json()) as T;
}

const callUrlFor = (path: string, params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString();
  return `${path}${qs ? `?${qs}` : ""}`;
};

// Ask Data (doc §57, §99): agents decide WHAT to do; governance, validation, registration and
// execution stay deterministic in Node. The API Registry is always checked before data discovery.
const askLimit = perUserRateLimit(Number(process.env.ASK_RATE_PER_MIN ?? 12));

askRouter.post("/ask", requireUser, askLimit, async (req: AuthedRequest, res) => {
  const requestText = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!requestText) return res.status(400).json({ error: "EMPTY_REQUEST" });
  const user = req.user!;

  const run = await prisma.workflowRun.create({ data: { requesterId: user.id, requestText } });
  await logAudit({ requestId: run.id, actorId: user.id, action: "ASK_RECEIVED", resource: requestText });

  const finish = async (status: string, summary: Record<string, unknown>) => {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status, resultSummary: summary as object } });
    return res.json({ runId: run.id, status, ...summary });
  };

  try {
    // 1. Intent + API discovery (registry first).
    const analysis = await agentPost<AgentAnalysis>("/analyze", { request_text: requestText });
    await logAudit({
      requestId: run.id, actorId: user.id, action: "AGENT_ANALYZED",
      resource: analysis.api?.path, metadata: { intent: analysis.intent, discovery: analysis.discovery },
    });
    const base = { intent: analysis.intent, discovery: analysis.discovery, api: analysis.api };

    if (analysis.api) {
      // Calling the API goes through the runtime route, which enforces governance/HITL at call time.
      return finish("API_READY", { ...base, callUrl: callUrlFor(analysis.api.path, analysis.discovery.params) });
    }

    // 2. No API: data discovery. If the data only exists in a source system, source discovery + ETL
    //    (doc §11) runs first; once approved and loaded, discovery is repeated against the warehouse.
    let found = await agentPost<AgentDiscovery>("/discover", analysis.intent);
    let etl: unknown;
    const sourceOnly = found.assets.filter((a) => !a.in_warehouse);
    if (!found.data_available && sourceOnly.length > 0) {
      const outcome = await resolveEtl(sourceOnly, user, run.id);
      const partial = { ...base, dataDiscovery: found };
      switch (outcome.kind) {
        case "no_pipeline":
          return finish("NO_DATA", {
            ...partial,
            message: `The data is only in source systems (${outcome.tables.join(", ")}) and no ETL pipeline exists to load it, so this cannot be answered. Contact the data platform team.`,
          });
        case "hitl_pending":
          return finish("WAITING_HITL", { ...partial, hitlRequestId: outcome.hitlRequestId, reason: outcome.reason, etl: outcome.etl });
        case "running":
          return finish("ETL_RUNNING", { ...partial, etl: outcome.etl, message: "The ETL is running. Ask again in a few seconds." });
        case "rejected":
          return finish("REJECTED", { ...partial, reason: outcome.reason, etl: outcome.etl });
        case "ready":
          etl = { note: "Data loaded into the warehouse by ETL; workflow resumed." };
          found = await agentPost<AgentDiscovery>("/discover", analysis.intent);
      }
    }
    await logAudit({
      requestId: run.id, actorId: user.id, action: "DATA_DISCOVERED",
      metadata: { data_available: found.data_available, assets: found.assets.map((a) => `${a.schema_name}.${a.table_name}`) },
    });
    const withData = { ...base, dataDiscovery: found, ...(etl ? { etl } : {}) };
    if (!found.data_available) {
      return finish("NO_DATA", { ...withData, message: found.missing || "The required data is not available in the warehouse." });
    }

    // 3. Data-access governance (deterministic).
    const access = await checkDataAccess(found.assets, user, run.id);
    if (access.kind === "denied") return finish("REJECTED", { ...withData, reason: access.reason });
    if (access.kind === "hitl_pending") {
      return finish("WAITING_HITL", { ...withData, hitlRequestId: access.hitlRequestId, reason: access.reason });
    }

    // 4. API planning -> validation -> registration.
    //    The model can propose an invalid plan (e.g. an invented column). Validation is the gate; on
    //    failure the exact problems are fed back once so the agent can repair its plan.
    let plan = await agentPost<AgentPlan>("/plan", { intent: analysis.intent, assets: found.assets });
    let validated;
    for (let attempt = 0; ; attempt++) {
      try {
        validated = await validatePlan(plan, found.assets);
        break;
      } catch (err) {
        if (!(err instanceof PlanValidationError)) throw err;
        await logAudit({ requestId: run.id, actorId: user.id, action: "PLAN_REJECTED", metadata: { attempt, problems: err.problems } });
        if (attempt >= 1) {
          return finish("FAILED", { ...withData, error: "The generated API plan failed validation.", problems: err.problems });
        }
        plan = await agentPost<AgentPlan>("/plan", { intent: analysis.intent, assets: found.assets, problems: err.problems });
      }
    }
    const { entry, created } = await registerApi(plan, validated, user, run.id);

    // Fill parameters the plan declares from the filters the user asked for.
    const declared = new Map(validated.parameters.map((p) => [p.name.toLowerCase(), p.name]));
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(analysis.intent.filters)) {
      const name = declared.get(k.toLowerCase());
      if (name) params[name] = v;
    }
    return finish("API_READY", {
      ...withData,
      api: { id: entry.id, name: entry.name, path: entry.path, classification: entry.classification },
      generated: created,
      callUrl: callUrlFor(entry.path, params),
    });
  } catch (err) {
    // Recording the failure must never itself turn into a 500.
    await logAudit({ requestId: run.id, actorId: user.id, action: "AGENT_FAILED", metadata: { error: String(err) } }).catch(() => undefined);
    await prisma.workflowRun
      .updateMany({ where: { id: run.id }, data: { status: "FAILED", resultSummary: { error: String(err) } } })
      .catch(() => undefined);
    const rateLimited = err instanceof AgentError && err.httpStatus === 429;
    return res
      .status(rateLimited ? 429 : 502)
      .json({ runId: run.id, status: "FAILED", error: rateLimited ? "LLM_QUOTA_EXHAUSTED" : "AGENT_UNAVAILABLE" });
  }
});

askRouter.get("/requests", requireUser, async (req: AuthedRequest, res) => {
  const runs = await prisma.workflowRun.findMany({
    where: { requesterId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ requests: runs });
});

askRouter.get("/requests/:id", requireUser, async (req: AuthedRequest, res) => {
  const run = await prisma.workflowRun.findFirst({ where: { id: String(req.params.id), requesterId: req.user!.id } });
  if (!run) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ request: run });
});
