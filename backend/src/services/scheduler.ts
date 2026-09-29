// Offline scheduling (doc §79): the Lifecycle Agent runs on a timer, not only on demand.
// LIFECYCLE_INTERVAL_HOURS controls the cadence (default 24; 0 disables). Runs as the system (no actor).
import { logger } from "../lib/logger.js";
import { runLifecycleReview } from "./lifecycle.js";

export function startScheduler(): void {
  const hours = Number(process.env.LIFECYCLE_INTERVAL_HOURS ?? 24);
  if (!Number.isFinite(hours) || hours <= 0) {
    logger.info("lifecycle scheduler disabled (LIFECYCLE_INTERVAL_HOURS=0)");
    return;
  }
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      const report = await runLifecycleReview();
      logger.info({ reportId: report.id }, "scheduled lifecycle review completed");
    } catch (err) {
      logger.error({ err }, "scheduled lifecycle review failed");
    } finally {
      running = false;
    }
  }, hours * 3_600_000);
  timer.unref(); // don't keep the process alive just for the timer
  logger.info(`lifecycle scheduler started (every ${hours}h)`);
}
