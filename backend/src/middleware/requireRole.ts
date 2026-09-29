import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./requireUser.js";

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "FORBIDDEN", requiredRoles: roles });
    }
    next();
  };
}
