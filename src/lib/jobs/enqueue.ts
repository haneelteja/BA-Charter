import { after } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { JobPayloadMap, JobType } from "./types";
import { processPendingJobs } from "./processQueue";

/**
 * No separate always-on worker process in production (EXECUTION_PLAN.md
 * §3.A, revised): Vercel's Fluid Compute gives every plan 300s of after()
 * background execution per request, so the triggering request itself
 * drains a few due jobs after responding, instead of a continuously
 * polling host. A future-run_after job (e.g. promote_provisional_decisions,
 * scheduled hours out) simply won't be claimed yet when this fires —
 * claim_next_job already filters on run_after — it's picked up later by
 * whichever request's after() (or the Cron sweep route) happens to run
 * once it's due.
 *
 * Always safe to call from here unconditionally: every remaining call site
 * is a Server Action or Route Handler, both valid after() contexts. The
 * local `npm run worker` script no longer calls this (see src/jobs/worker.ts).
 */
export async function enqueueJob<T extends JobType>(
  jobType: T,
  payload: JobPayloadMap[T],
  options?: { runAfter?: Date }
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase.from("job_queue").insert({
    job_type: jobType,
    payload,
    run_after: options?.runAfter?.toISOString() ?? new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to enqueue job "${jobType}": ${error.message}`);
  }

  after(() => processPendingJobs({ maxJobs: 10 }).catch((err) => console.error("[jobs] after() drain failed:", err)));
}
