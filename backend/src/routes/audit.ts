import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";

export const auditRouter = Router();

// Privileged roles see the whole trail; everyone else only sees events they performed themselves.
const AUDIT_ROLES = ["DWH_ADMIN", "DATA_ENGINEER"];

auditRouter.get("/audit", requireUser, async (req: AuthedRequest, res) => {
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const scope = AUDIT_ROLES.includes(req.user!.role) ? {} : { actorId: req.user!.id };
  const logs = await prisma.auditLog.findMany({
    where: { ...(action ? { action } : {}), ...scope },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ logs });
});
