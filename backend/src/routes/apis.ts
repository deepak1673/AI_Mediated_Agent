import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";
import { invokeRegisteredApi } from "../services/apiRuntime.js";

export const apisRouter = Router();

// Registry list + search (API Registry page, doc §66).
apisRouter.get("/apis", requireUser, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const entries = await prisma.apiRegistryEntry.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { name: "asc" },
  });
  res.json({ apis: entries });
});

apisRouter.get("/apis/:id", requireUser, async (req, res) => {
  const entry = await prisma.apiRegistryEntry.findUnique({ where: { id: String(req.params.id) } });
  if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ api: entry });
});

// The Node API Runtime: any registered API is invoked through this single dynamic route.
// Mounted at /api, so this resolves to /api/generated/:slug.
apisRouter.get("/generated/:slug", requireUser, async (req: AuthedRequest, res) => {
  const fullPath = `/api/generated/${req.params.slug}`;
  const entry = await prisma.apiRegistryEntry.findUnique({ where: { path: fullPath } });
  if (!entry) return res.status(404).json({ error: "API_NOT_FOUND" });

  // BROKEN APIs depend on something that no longer exists; fail cleanly instead of leaking a SQL error.
  if (entry.status === "BROKEN") {
    return res.status(503).json({ error: "API_UNAVAILABLE", reason: "This API is currently broken and has been flagged for repair." });
  }
  if (entry.status === "DEPRECATED") {
    res.setHeader("Deprecation", "true");
    res.setHeader("Warning", '299 - "This API version is deprecated"');
  }

  // Prototype-less: a query key or parameter name such as "constructor" can never hit an inherited property.
  const params: Record<string, string | undefined> = Object.create(null);
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") params[k] = v;
  }

  const outcome = await invokeRegisteredApi(entry, params, {
    userId: req.user!.id,
    role: req.user!.role,
    team: req.user!.team,
  });

  switch (outcome.kind) {
    case "success":
      return res.json({ data: outcome.rows });
    case "hitl_pending":
      return res.status(202).json({ status: "PENDING_APPROVAL", hitlRequestId: outcome.hitlRequestId, reason: outcome.reason });
    case "denied":
      return res.status(403).json({ error: "HARD_DENY", reason: outcome.reason });
    case "missing_parameter":
      return res.status(400).json({ error: "MISSING_PARAMETER", param: outcome.param });
  }
});
