import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";
import { requireRole } from "../middleware/requireRole.js";
import { recordStep, runEtl } from "../services/etl.js";
import { logAudit } from "../services/audit.js";

export const hitlRouter = Router();

// Approvals workspace (doc §69) — DWH_ADMIN only, per our seeded policies' approver role.
hitlRouter.get("/hitl", requireUser, requireRole("DWH_ADMIN"), async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const requests = await prisma.hitlRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  const requesterIds = [...new Set(requests.map((r) => r.requesterId))];
  const requesters = await prisma.user.findMany({ where: { id: { in: requesterIds } } });
  const byId = new Map(requesters.map((u) => [u.id, u]));
  res.json({ requests: requests.map((r) => ({ ...r, requester: byId.get(r.requesterId) ?? null })) });
});

// A regular user can see their own HITL requests ("waiting for approval" state, doc §76).
hitlRouter.get("/hitl/mine", requireUser, async (req: AuthedRequest, res) => {
  const requests = await prisma.hitlRequest.findMany({
    where: { requesterId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ requests });
});

hitlRouter.get("/hitl/:id", requireUser, async (req: AuthedRequest, res) => {
  const request = await prisma.hitlRequest.findUnique({ where: { id: String(req.params.id) } });
  // Only the requester or an admin may read an approval request.
  if (!request || (req.user!.role !== "DWH_ADMIN" && request.requesterId !== req.user!.id)) {
    return res.status(404).json({ error: "NOT_FOUND" });
  }
  res.json({ request });
});

hitlRouter.post("/hitl/:id/decision", requireUser, requireRole("DWH_ADMIN"), async (req: AuthedRequest, res) => {
  const { decision, approvalScope, rejectionReason } = req.body as {
    decision: "APPROVED" | "REJECTED";
    approvalScope?: unknown;
    rejectionReason?: string;
  };
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return res.status(400).json({ error: "INVALID_DECISION" });
  }

  const existing = await prisma.hitlRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  // Atomic PENDING -> decided transition: two admins acting at once cannot both win, and an approval can
  // never be flipped afterwards (which would also start a second ETL run).
  const won = await prisma.hitlRequest.updateMany({
    where: { id: existing.id, status: "PENDING" },
    data: {
      status: decision,
      approverId: req.user!.id,
      approvalScope: decision === "APPROVED" ? (approvalScope as object | undefined) : undefined,
      rejectionReason: decision === "REJECTED" ? rejectionReason : undefined,
      decidedAt: new Date(),
    },
  });
  if (won.count === 0) return res.status(409).json({ error: "ALREADY_DECIDED" });
  const updated = await prisma.hitlRequest.findUniqueOrThrow({ where: { id: existing.id } });

  await logAudit({
    actorId: req.user!.id,
    action: decision === "APPROVED" ? "HITL_APPROVE" : "HITL_REJECT",
    resource: JSON.stringify(existing.requestedResource),
    decision,
    metadata: { hitlRequestId: existing.id, requesterId: existing.requesterId },
  });

  // Reflect the decision on the request the user is watching (My Requests). Approved requests wait
  // for the user to resume; the original run id may be a synthetic value, hence updateMany.
  await prisma.workflowRun.updateMany({
    where: { id: existing.workflowRunId, status: "WAITING_HITL" },
    data: { status: decision === "APPROVED" ? "APPROVED" : "REJECTED" },
  });

  // ETL approvals kick off the mock ETL in the background (doc §11: approve -> ETL -> resume).
  if (existing.hitlType === "HITL_ETL_EXECUTION") {
    const etl = await prisma.etlRun.findFirst({ where: { hitlRequestId: existing.id } });
    if (etl) {
      if (decision === "APPROVED") {
        await recordStep(etl.id, "APPROVED", "ETL Approved", `by ${req.user!.name}`);
        void runEtl(etl.id);
      } else {
        await recordStep(etl.id, "REJECTED", "ETL Rejected", rejectionReason);
      }
    }
  }

  res.json({ request: updated });
});
