import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";
import { requireRole } from "../middleware/requireRole.js";
import { runLifecycleReview } from "../services/lifecycle.js";

export const insightsRouter = Router();

// Agent Reports (doc §116): latest + previous lifecycle reports.
insightsRouter.get("/reports", requireUser, async (_req, res) => {
  const reports = await prisma.report.findMany({ orderBy: { generatedAt: "desc" }, take: 30 });
  res.json({ reports });
});

insightsRouter.get("/reports/:id", requireUser, async (req, res) => {
  const report = await prisma.report.findUnique({ where: { id: String(req.params.id) } });
  if (!report) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ report });
});

insightsRouter.patch("/reports/:id/status", requireUser, requireRole("DWH_ADMIN", "DATA_ENGINEER"), async (req, res) => {
  const status = req.body?.status;
  if (!["NEW", "REVIEWED", "RESOLVED"].includes(status)) return res.status(400).json({ error: "INVALID_STATUS" });
  const report = await prisma.report.update({ where: { id: String(req.params.id) }, data: { status } }).catch(() => null);
  if (!report) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ report });
});

// The lifecycle agent runs offline in production; here an admin/data engineer triggers it on demand.
insightsRouter.post("/reports/lifecycle/run", requireUser, requireRole("DWH_ADMIN", "DATA_ENGINEER"), async (req: AuthedRequest, res) => {
  const report = await runLifecycleReview(req.user!.id);
  res.status(201).json({ report });
});

// User Analytics (doc §116): request volume, most used APIs, request outcomes.
insightsRouter.get("/analytics/usage", requireUser, async (_req, res) => {
  const days = 14;
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const runs = await prisma.workflowRun.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } });
  const perDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    perDay.set(new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  const byStatus: Record<string, number> = {};
  for (const r of runs) {
    const d = r.createdAt.toISOString().slice(0, 10);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  const topApis = await prisma.apiRegistryEntry.findMany({
    where: { usageCount: { gt: 0 } }, orderBy: { usageCount: "desc" }, take: 5,
    select: { id: true, name: true, usageCount: true, classification: true },
  });
  const generated = await prisma.auditLog.count({ where: { action: "API_REGISTERED" } });
  res.json({
    totalRequests: runs.length,
    perDay: [...perDay.entries()].map(([date, count]) => ({ date, count })),
    byStatus,
    topApis,
    generatedApis: generated,
  });
});
