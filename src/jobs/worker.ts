import { randomUUID } from "crypto";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { JobType } from "@/lib/jobs/types";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { handlers } from "./handlers";

const SELF_SCHEDULING_JOB_TYPES: JobType[] = ["sweep_action_item_overdue", "sweep_clarification_ageing"];

const WORKER_ID = `worker-${randomUUID()}`;
const POLL_INTERVAL_MS = 2_000;

interface ClaimedJob {
  job_id: string;
  job_type: JobType;
  payload: unknown;
}

async function runOnce(): Promise<boolean> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: job, error } = await supabase
    .rpc("claim_next_job", { p_worker_id: WORKER_ID })
    .single<ClaimedJob>();

  if (error) {
    console.error("[worker] claim failed:", error.message);
    return false;
  }
  if (!job) {
    return false;
  }

  const handler = handlers[job.job_type];
  if (!handler) {
    await supabase.rpc("fail_job", {
      p_job_id: job.job_id,
      p_error: `No handler registered for job_type "${job.job_type}".`,
    });
    return true;
  }

  try {
    console.log(`[worker] running ${job.job_type} (${job.job_id})`);
    await handler(job.payload);
    await supabase.rpc("complete_job", { p_job_id: job.job_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] ${job.job_type} (${job.job_id}) failed:`, message);
    await supabase.rpc("fail_job", { p_job_id: job.job_id, p_error: message });
  }

  return true;
}

/**
 * Self-rescheduling sweeps (each handler re-enqueues itself when it
 * finishes — see sweepActionItemOverdue/sweepClarificationAgeing) need one
 * seed job to start the chain. Only enqueue if neither a pending nor an
 * already-processing job of that type exists, so restarting the worker
 * doesn't stack up duplicate chains.
 */
async function seedSelfSchedulingJobs() {
  const supabase = getSupabaseServiceRoleClient();

  for (const jobType of SELF_SCHEDULING_JOB_TYPES) {
    const { count, error } = await supabase
      .from("job_queue")
      .select("job_id", { count: "exact", head: true })
      .eq("job_type", jobType)
      .in("status", ["pending", "processing"]);

    if (error) {
      console.error(`[worker] failed to check existing ${jobType} jobs:`, error.message);
      continue;
    }
    if (!count) {
      console.log(`[worker] seeding initial ${jobType} job`);
      await enqueueJob(jobType, {});
    }
  }
}

async function main() {
  console.log(`[worker] ${WORKER_ID} started, polling every ${POLL_INTERVAL_MS}ms`);
  await seedSelfSchedulingJobs();

  while (true) {
    const didWork = await runOnce();
    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
