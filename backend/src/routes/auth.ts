import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser, type AuthedRequest } from "../middleware/requireUser.js";

export const authRouter = Router();

// Demo user picker — lets the login page list who you can "sign in" as.
authRouter.get("/demo-users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, team: true, role: true },
  });
  res.json({ users });
});

authRouter.post("/login", async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  req.session = { userId: user.id };
  res.json({ user });
});

authRouter.post("/logout", (req, res) => {
  req.session = null;
  res.status(204).end();
});

authRouter.get("/me", requireUser, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});
