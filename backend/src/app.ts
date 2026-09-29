import express from "express";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./middleware/session.js";
import { authRouter } from "./routes/auth.js";
import { apisRouter } from "./routes/apis.js";
import { catalogRouter } from "./routes/catalog.js";
import { hitlRouter } from "./routes/hitl.js";
import { auditRouter } from "./routes/audit.js";
import { askRouter } from "./routes/ask.js";
import { insightsRouter } from "./routes/insights.js";
import { overviewRouter } from "./routes/overview.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(sessionMiddleware);
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "backend" });
  });

  // Every JSON route lives under /api — kept distinct from the SPA's own page routes
  // (/apis, /catalog, /approvals, ...) of the same name. See vite.config.ts.
  app.use("/api/auth", authRouter);
  app.use("/api", apisRouter);
  app.use("/api", catalogRouter);
  app.use("/api", hitlRouter);
  app.use("/api", auditRouter);
  app.use("/api", askRouter);
  app.use("/api", insightsRouter);
  app.use("/api", overviewRouter);

  // Last resort: log the detail server-side, never send stack traces or SQL errors to the client.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, path: req.path }, "unhandled request error");
    if (res.headersSent) return;
    res.status(500).json({ error: "INTERNAL_ERROR" });
  });

  return app;
}
