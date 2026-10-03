import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";
import type { JobPayloadMap } from "@/lib/jobs/types";

/**
 * §8 rule 3: Provisional decisions become Confirmed once the acknowledgement
 * window lapses without dispute. Scheduled (via run_after) at distribution
 * time for project.mom_ack_window_hours later. If a dispute already fired
 * (disputeMinutes reverts decisions to Candidate and the minutes to
 * Disputed) before this runs, there's nothing left in Provisional state to
 * promote — the check below is naturally a no-op in that case.
 */
export async function handlePromoteProvisionalDecisions(
  payload: JobPayloadMap["promote_provisional_decisions"]
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { projectId, interactionId, minutesId } = payload;

  const { data: minutes, error: minutesError } = await supabase
    .from("minutes_document")
    .select("status")
    .eq("minutes_id", minutesId)
    .single();

  if (minutesError) {
    throw new Error(`Minutes document not found: ${minutesError.message}`);
  }
  if (minutes.status === "Disputed") {
    return;
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("extraction_candidate")
    .select("resulting_object_id")
    .eq("interaction_id", interactionId)
    .eq("resulting_object_type", "Decision")
    .not("resulting_object_id", "is", null);

  if (candidatesError) {
    throw new Error(`Failed to load committed decisions: ${candidatesError.message}`);
  }

  const decisionIds = (candidates ?? [])
    .map((c) => c.resulting_object_id)
    .filter((id): id is string => id !== null);

  if (decisionIds.length === 0) {
    return;
  }

  const { data: promoted, error: promoteError } = await supabase
    .from("decision")
    .update({ status: "Confirmed", confirmed_at: new Date().toISOString() })
    .in("decision_id", decisionIds)
    .eq("status", "Provisional")
    .select("decision_id");

  if (promoteError) {
    throw new Error(`Failed to promote decisions: ${promoteError.message}`);
  }

  if (promoted && promoted.length > 0) {
    await logAuditEvent(supabase, {
      projectId,
      actorUserId: null,
      eventType: "Confirmed",
      targetObjectType: "Decision",
      newValue: { promoted_decision_ids: promoted.map((d) => d.decision_id), reason: "ack_window_lapsed" },
    });
  }
}
