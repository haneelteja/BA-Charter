import { processPendingJobs } from "@/lib/jobs/processQueue";

/**
 * Local-dev convenience only — production has no separate worker process
 * (see src/lib/jobs/enqueue.ts for why: after() + Vercel Cron replace it).
 * Useful when developing locally against jobs enqueued by the app without
 * wanting to wait for or fake a Cron trigger.
 */
const POLL_INTERVAL_MS = 2_000;

async function main() {
  console.log(`[worker] local dev poller started, every ${POLL_INTERVAL_MS}ms`);

  while (true) {
    const processed = await processPendingJobs({ maxJobs: 1 });
    if (processed === 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
