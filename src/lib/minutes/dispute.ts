import type { SupabaseClient } from "@supabase/supabase-js";

export interface RevertMinutesDisputeInput {
  minutesId: string;
  interactionId: string;
  disputeNote: string;
}

/**
 * §8 rule 4: dispute reverts committed decisions to Candidate and reopens
 * the interaction at Extracted. Shared by the authenticated in-app dispute
 * action (minutes-actions.ts) and the public tokenized one
 * (src/app/minutes/[token]/actions.ts) — both must land on identical
 * state, same reasoning as src/lib/delivery/assignNextPartner.ts.
 */
export async function revertMinutesDispute(
  supabase: SupabaseClient,
  input: RevertMinutesDisputeInput
): Promise<{ decisionIds: string[] }> {
  const { minutesId, interactionId, disputeNote } = input;

  const { error: minutesError } = await supabase
    .from("minutes_document")
    .update({ status: "Disputed", dispute_note: disputeNote })
    .eq("minutes_id", minutesId);
  if (minutesError) throw new Error(`Failed to record dispute: ${minutesError.message}`);

  const { data: committedDecisions, error: candidatesError } = await supabase
    .from("extraction_candidate")
    .select("candidate_id, resulting_object_id")
    .eq("interaction_id", interactionId)
    .eq("resulting_object_type", "Decision")
    .not("resulting_object_id", "is", null);
  if (candidatesError) throw new Error(`Failed to load committed decisions: ${candidatesError.message}`);

  const decisionIds = (committedDecisions ?? [])
    .map((c) => c.resulting_object_id)
    .filter((id): id is string => id !== null);

  if (decisionIds.length > 0) {
    await supabase
      .from("decision")
      .update({ status: "Candidate" })
      .in("decision_id", decisionIds)
      .eq("status", "Provisional");

    await supabase
      .from("extraction_candidate")
      .update({ status: "Pending", resulting_object_type: null, resulting_object_id: null, decided_by: null, decided_at: null })
      .in(
        "candidate_id",
        (committedDecisions ?? []).map((c) => c.candidate_id)
      );
  }

  const { error: interactionError } = await supabase
    .from("interaction")
    .update({ processing_status: "Extracted" })
    .eq("interaction_id", interactionId);
  if (interactionError) throw new Error(`Failed to reopen interaction: ${interactionError.message}`);

  return { decisionIds };
}
