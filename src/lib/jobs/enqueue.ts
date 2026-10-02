import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { JobPayloadMap, JobType } from "./types";

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
}
