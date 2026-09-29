import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; name: string; team: string; role: string };
}

export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
  req.user = user;
  next();
}
