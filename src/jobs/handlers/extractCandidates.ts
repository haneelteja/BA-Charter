import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { extractCandidates, type ExtractionResult } from "@/lib/ai/extraction";
import { logAuditEvent } from "@/lib/audit/log";
import type { JobPayloadMap } from "@/lib/jobs/types";

type CandidateRow = ExtractionResult["decisions"][number] & {
  candidateType: "Decision" | "ActionItem" | "Clarification" | "Risk" | "ChangeSignal";
  suggestedDueDate?: string | null;
};

export async function handleExtractCandidates(
  payload: JobPayloadMap["extract_candidates"]
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { projectId, interactionId, userId } = payload;

  const { data: interaction, error: interactionError } = await supabase
    .from("interaction")
    .select("interaction_id")
    .eq("interaction_id", interactionId)
    .single();

  if (interactionError) {
    throw new Error(`Interaction not found: ${interactionError.message}`);
  }
  void interaction;

  const { data: utteranceRows, error: utteranceError } = await supabase
    .from("utterance")
    .select("utterance_id, sequence_no, speaker_label, content")
    .eq("interaction_id", interactionId)
    .order("sequence_no");

  if (utteranceError) {
    throw new Error(`Failed to load utterances: ${utteranceError.message}`);
  }
  if (!utteranceRows || utteranceRows.length === 0) {
    throw new Error("Interaction has no utterances to extract from.");
  }

  const { data: project, error: projectError } = await supabase
    .from("project")
    .select("confidence_threshold")
    .eq("project_id", projectId)
    .single();

  if (projectError) {
    throw new Error(`Failed to load project: ${projectError.message}`);
  }

  const { data: confirmedDecisions, error: decisionsError } = await supabase
    .from("decision")
    .select("decision_id, statement")
    .eq("project_id", projectId)
    .eq("status", "Confirmed");

  if (decisionsError) {
    throw new Error(`Failed to load existing decisions: ${decisionsError.message}`);
  }

  const model = await resolveUserLanguageModel(userId);

  const result = await extractCandidates({
    model,
    utterances: utteranceRows.map((u) => ({
      sequenceNo: u.sequence_no,
      speakerLabel: u.speaker_label,
      content: u.content ?? "",
    })),
    existingConfirmedDecisions: (confirmedDecisions ?? []).map((d) => ({
      decisionId: d.decision_id,
      statement: d.statement,
    })),
  });

  const utteranceBySeq = new Map(utteranceRows.map((u) => [u.sequence_no, u.utterance_id]));
  const threshold = project.confidence_threshold ?? 0.8;

  const allCandidates: CandidateRow[] = [
    ...result.decisions.map((d) => ({ ...d, candidateType: "Decision" as const })),
    ...result.actionItems.map((a) => ({ ...a, candidateType: "ActionItem" as const })),
    ...result.clarifications.map((c) => ({ ...c, candidateType: "Clarification" as const })),
    ...result.risks.map((r) => ({ ...r, candidateType: "Risk" as const })),
    ...result.changeSignals.map((c) => ({ ...c, candidateType: "ChangeSignal" as const })),
  ];

  if (allCandidates.length > 0) {
    const rows = allCandidates.map((c) => {
      const contradicts = "contradictsExistingDecisionId" in c ? c.contradictsExistingDecisionId : null;
      // §3.2 stage 3: high confidence items are pre-accepted but revertible;
      // low confidence AND contradicting items always require explicit
      // (contradicting: Lead BA) decision regardless of score.
      const isPreAccepted = !contradicts && c.confidenceScore >= threshold;

      return {
        project_id: projectId,
        interaction_id: interactionId,
        candidate_type: c.candidateType,
        statement: c.statement,
        suggested_owner: c.suggestedOwner ?? null,
        suggested_due_date: "suggestedDueDate" in c ? c.suggestedDueDate ?? null : null,
        confidence_score: c.confidenceScore,
        source_utterance_id:
          c.sourceUtteranceSequenceNo != null ? utteranceBySeq.get(c.sourceUtteranceSequenceNo) ?? null : null,
        contradicts_decision_id: contradicts ?? null,
        contradiction_explanation:
          "contradictionExplanation" in c ? c.contradictionExplanation ?? null : null,
        status: isPreAccepted ? "Accepted" : "Pending",
        decided_at: isPreAccepted ? new Date().toISOString() : null,
      };
    });

    const { error: insertError } = await supabase.from("extraction_candidate").insert(rows);
    if (insertError) {
      throw new Error(`Failed to store extraction candidates: ${insertError.message}`);
    }
  }

  const { error: statusError } = await supabase
    .from("interaction")
    .update({ processing_status: "Extracted" })
    .eq("interaction_id", interactionId);

  if (statusError) {
    throw new Error(`Failed to update interaction status: ${statusError.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: userId,
    eventType: "ModelUpdated",
    targetObjectType: "Interaction",
    targetObjectId: interactionId,
    newValue: { processing_status: "Extracted", candidate_count: allCandidates.length },
  });
}
