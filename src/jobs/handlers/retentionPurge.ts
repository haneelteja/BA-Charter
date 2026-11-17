import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * EPIC 17, scheduled half: anonymise (EXECUTION_PLAN.md §3.G), not hard
 * delete. Structural rows (interaction, utterance) stay in place so
 * trace_link and audit_event references to them never dangle — only the
 * human-readable content columns are redacted, and is_purged flips so this
 * never re-processes the same interaction. Decisions/action items/stories
 * already derived from the interaction keep their own text; that's
 * resolved institutional knowledge, not the raw source it came from.
 */
export async function handleRetentionPurge(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error } = await supabase
    .from("interaction")
    .select("interaction_id, project_id")
    .lte("purge_after", today)
    .eq("is_purged", false);

  if (error) {
    throw new Error(`Failed to query interactions due for purge: ${error.message}`);
  }

  for (const interaction of due ?? []) {
    await purgeInteraction(supabase, interaction.interaction_id, interaction.project_id, null);
  }
}

/** Shared by the scheduled sweep above and the manual purge-on-request action (EPIC 17's other half). */
export async function purgeInteraction(
  supabase: SupabaseClient,
  interactionId: string,
  projectId: string,
  actorUserId: string | null
): Promise<void> {
  const { error: utteranceError } = await supabase
    .from("utterance")
    // The embedding is derived from the content and can leak it through
    // similarity search or inversion, so it goes too (Requirements §7:
    // source transcripts are purgeable).
    .update({ content: null, speaker_label: null, embedding: null })
    .eq("interaction_id", interactionId);
  if (utteranceError) {
    throw new Error(`Failed to redact utterances: ${utteranceError.message}`);
  }

  // Candidate statements still awaiting review are verbatim or near-verbatim
  // source text. Committed ones became decisions, action items or
  // clarifications (resolved knowledge, kept by design), so only
  // unreviewed and rejected candidates are redacted.
  const { error: candidateError } = await supabase
    .from("extraction_candidate")
    .update({ statement: "[purged]" })
    .eq("interaction_id", interactionId)
    .in("status", ["Pending", "Rejected", "Merged", "Split"]);
  if (candidateError) {
    throw new Error(`Failed to redact extraction candidates: ${candidateError.message}`);
  }

  const { error: interactionError } = await supabase
    .from("interaction")
    .update({ title: null, raw_file_ref: null, is_purged: true })
    .eq("interaction_id", interactionId);
  if (interactionError) {
    throw new Error(`Failed to redact interaction: ${interactionError.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId,
    eventType: "Updated",
    targetObjectType: "Interaction",
    targetObjectId: interactionId,
    newValue: { is_purged: true, reason: actorUserId ? "manual" : "scheduled" },
  });
}
