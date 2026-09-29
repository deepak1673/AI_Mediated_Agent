import { prisma } from "../lib/prisma.js";

export async function logAudit(entry: {
  requestId?: string;
  actorId?: string;
  action: string;
  resource?: string;
  decision?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      requestId: entry.requestId,
      actorId: entry.actorId,
      action: entry.action,
      resource: entry.resource,
      decision: entry.decision,
      metadata: entry.metadata as object | undefined,
    },
  });
}
