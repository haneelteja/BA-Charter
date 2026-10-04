import { randomUUID } from "crypto";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { JobType } from "./types";
import { handlers } from "@/jobs/handlers";

interface ClaimedJob {
  job_id: string;
  job_type: JobType;
  payload: unknown;
}

/**
 * Claims and runs due jobs (claim_next_job already filters run_after <=
 * now()) until the queue is drained or maxJobs is hit. Shared by three
 * callers: enqueueJob's after() trigger (small budget, fires on every
 * request that enqueues something), the Vercel Cron route (larger budget,
 * catches anything an after() trigger missed — e.g. a future-run_after job
 * like promote_provisional_decisions where no one happens to enqueue
 * anything else after its due time), and the local `npm run worker` script
 * (unbounded, for development).
 */
export async function processPendingJobs(options?: { maxJobs?: number }): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const runnerId = `run-${randomUUID()}`;
  const maxJobs = options?.maxJobs ?? Infinity;

  let processed = 0;

  while (processed < maxJobs) {
    const { data: job, error } = await supabase
      .rpc("claim_next_job", { p_worker_id: runnerId })
      .single<ClaimedJob>();

    if (error) {
      console.error("[jobs] claim failed:", error.message);
      break;
    }
    // claim_next_job is declared RETURNS job_queue, so an empty claim still
    // comes back as one row of all-NULL columns (not zero rows) — `!job`
    // alone never catches that, so the loop would otherwise spin to maxJobs.
    if (!job || !job.job_id) {
      break;
    }

    const handler = handlers[job.job_type];
    if (!handler) {
      await supabase.rpc("fail_job", {
        p_job_id: job.job_id,
        p_error: `No handler registered for job_type "${job.job_type}".`,
      });
      processed++;
      continue;
    }

    try {
      console.log(`[jobs] running ${job.job_type} (${job.job_id})`);
      await handler(job.payload);
      await supabase.rpc("complete_job", { p_job_id: job.job_id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jobs] ${job.job_type} (${job.job_id}) failed:`, message);
      await supabase.rpc("fail_job", { p_job_id: job.job_id, p_error: message });
    }

    processed++;
  }

  return processed;
}
