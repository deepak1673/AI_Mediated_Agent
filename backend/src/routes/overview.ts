import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";

export const overviewRouter = Router();

const ACTIVITY_ACTIONS = [
  "ASK_RECEIVED", "API_REGISTERED", "HITL_CREATED", "HITL_APPROVE", "HITL_REJECT",
  "ETL_COMPLETED", "ETL_FAILED", "LIFECYCLE_REPORT_CREATED", "API_STATUS_CHANGED",
];

// Overview dashboard (doc §55): my activity, what needs attention, platform health, recent events.
overviewRouter.get("/overview", requireUser, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const isAdmin = user.role === "DWH_ADMIN";

  const [myRuns, apis, pendingApprovals, latestReport, events] = await Promise.all([
    prisma.workflowRun.findMany({ where: { requesterId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.apiRegistryEntry.groupBy({ by: ["status"], _count: true }),
    isAdmin ? prisma.hitlRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(null),
    prisma.report.findFirst({ orderBy: { generatedAt: "desc" } }),
    // Admins see platform-wide activity; everyone else only their own (audit events carry request text).
    prisma.auditLog.findMany({
      where: { action: { in: ACTIVITY_ACTIONS }, ...(isAdmin ? {} : { actorId: user.id }) },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const actors = await prisma.user.findMany({
    where: { id: { in: events.map((e) => e.actorId).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  const count = (s: string) => myRuns.filter((r) => r.status === s).length;
  res.json({
    me: {
      totalRequests: myRuns.length,
      completed: count("API_READY") + count("COMPLETED"),
      waitingApproval: count("WAITING_HITL"),
      readyToResume: myRuns.filter((r) => r.status === "APPROVED").map((r) => ({ id: r.id, requestText: r.requestText })).slice(0, 5),
    },
    pendingApprovals,
    apis: {
      total: apis.reduce((n, a) => n + a._count, 0),
      byStatus: Object.fromEntries(apis.map((a) => [a.status, a._count])),
    },
    latestReport: latestReport
      ? { id: latestReport.id, summary: latestReport.summary, severity: latestReport.severity, generatedAt: latestReport.generatedAt, status: latestReport.status }
      : null,
    recentActivity: events.map((e) => ({
      id: e.id, action: e.action, resource: e.resource, decision: e.decision, at: e.createdAt,
      actor: e.actorId ? nameOf.get(e.actorId) ?? null : null,
    })),
  });
});
