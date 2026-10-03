import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";
import { enqueueJob } from "@/lib/jobs/enqueue";

const SWEEP_INTERVAL_HOURS = 1;

/**
 * §3.4: "items unanswered beyond a configurable threshold are flagged in
 * the workspace and reported to the Lead BA." Threshold is per-project
 * (project.clarification_ageing_days). Same escalated_at idempotency and
 * self-rescheduling pattern as the action item sweep.
 */
export async function handleSweepClarificationAgeing(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: candidates, error } = await supabase
    .from("clarification")
    .select("clarification_id, project_id, question, raised_at, project:project_id(clarification_ageing_days)")
    .is("escalated_at", null)
    .in("status", ["Raised", "Prepared", "Asked"]);

  if (error) {
    throw new Error(`Failed to query clarifications: ${error.message}`);
  }

  for (const c of candidates ?? []) {
    const ageingDays = (c.project as unknown as { clarification_ageing_days: number } | null)
      ?.clarification_ageing_days ?? 14;
    const cutoff = Date.now() - ageingDays * 24 * 60 * 60 * 1000;
    if (new Date(c.raised_at).getTime() >= cutoff) continue;

    const { error: updateError } = await supabase
      .from("clarification")
      .update({ escalated_at: new Date().toISOString() })
      .eq("clarification_id", c.clarification_id);

    if (updateError) {
      throw new Error(`Failed to mark clarification escalated: ${updateError.message}`);
    }

    await logAuditEvent(supabase, {
      projectId: c.project_id,
      actorUserId: null,
      eventType: "Escalated",
      targetObjectType: "Clarification",
      targetObjectId: c.clarification_id,
      newValue: { question: c.question, reason: "ageing" },
    });
  }

  const runAfter = new Date();
  runAfter.setHours(runAfter.getHours() + SWEEP_INTERVAL_HOURS);
  await enqueueJob("sweep_clarification_ageing", {}, { runAfter });
}
