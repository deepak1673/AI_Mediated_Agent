import "dotenv/config";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { startScheduler } from "./services/scheduler.js";

// The POC signs users in by picking a name (no password) and ships dev fallback secrets. That is fine on a
// laptop and unacceptable anywhere else, so production refuses to start unless it is configured properly
// and demo sign-in is explicitly acknowledged.
if (process.env.NODE_ENV === "production") {
  const problems: string[] = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "change-me-in-dev") problems.push("SESSION_SECRET must be set to a strong random value");
  if (!process.env.INTERNAL_TOKEN || process.env.INTERNAL_TOKEN === "dev-internal-token") problems.push("INTERNAL_TOKEN must be set to a strong random value");
  if (process.env.DEMO_AUTH !== "true") problems.push("demo sign-in has no passwords; set DEMO_AUTH=true only to acknowledge that this is a demo deployment");
  if (problems.length) {
    logger.fatal("refusing to start in production: " + problems.join("; "));
    process.exit(1);
  }
}

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  logger.info(`backend listening on http://localhost:${port}`);
  startScheduler();
});
