import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "../middleware/requireUser.js";

/** Per-user sliding-window limiter (in memory). Protects the shared LLM quota from one noisy user. */
export function perUserRateLimit(maxPerWindow: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const key = req.user?.id ?? req.ip ?? "anon";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxPerWindow) {
      const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "RATE_LIMITED", retryAfterSeconds: retryAfter });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
