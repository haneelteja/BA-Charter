"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { parseUtterances } from "@/lib/transcript/parse";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { purgeInteraction } from "@/jobs/handlers/retentionPurge";

const SOURCE_TYPES = ["Transcript", "Email", "Chat", "ManualNote", "Document"] as const;

/**
 * Manual upload only for v1 (EXECUTION_PLAN.md §3.B) — text paste rather
 * than a file blob, to avoid standing up Storage + its own RLS surface for
 * this phase. raw_file_ref is left null; revisit if file upload becomes a
 * real requirement later.
 */
export async function createInteraction(projectId: string, formData: FormData) {
  const sourceType = String(formData.get("source_type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const occurredAt = String(formData.get("occurred_at") ?? "") || null;
  const content = String(formData.get("content") ?? "");

  if (!SOURCE_TYPES.includes(sourceType as (typeof SOURCE_TYPES)[number])) {
    throw new Error(`Invalid source type: ${sourceType}`);
  }
  if (!content.trim()) {
    throw new Error("Content is required.");
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { data: project, error: projectError } = await supabase
    .from("project")
    .select("retention_days")
    .eq("project_id", projectId)
    .single();

  if (projectError) {
    throw new Error(`Failed to load project: ${projectError.message}`);
  }

  const purgeAfter = new Date();
  purgeAfter.setDate(purgeAfter.getDate() + (project.retention_days ?? 365));

  const { data: interaction, error: interactionError } = await supabase
    .from("interaction")
    .insert({
      project_id: projectId,
      source_type: sourceType,
      title: title || null,
      occurred_at: occurredAt,
      ingested_by: auth.user.id,
      processing_status: "Received",
      purge_after: purgeAfter.toISOString().slice(0, 10),
    })
    .select("interaction_id")
    .single();

  if (interactionError) {
    throw new Error(`Failed to create interaction: ${interactionError.message}`);
  }

  const utterances = parseUtterances(content);
  if (utterances.length > 0) {
    const { data: insertedUtterances, error: utteranceError } = await supabase
      .from("utterance")
      .insert(
        utterances.map((u) => ({
          interaction_id: interaction.interaction_id,
          sequence_no: u.sequenceNo,
          speaker_label: u.speakerLabel,
          content: u.content,
        }))
      )
      .select("utterance_id");

    if (utteranceError) {
      throw new Error(`Failed to store utterances: ${utteranceError.message}`);
    }

    for (const u of insertedUtterances ?? []) {
      await enqueueEmbedding(supabase, projectId, "Utterance", u.utterance_id, auth.user.id);
    }
  }

  // "Indexed" here means normalised into utterances — semantic indexing
  // (embedding, enqueued above) runs async via the job queue and doesn't
  // gate this status. Extraction (EPIC 4) is the next real stage.
  await supabase
    .from("interaction")
    .update({ processing_status: "Indexed" })
    .eq("interaction_id", interaction.interaction_id);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: auth.user.id,
    eventType: "Created",
    targetObjectType: "Interaction",
    targetObjectId: interaction.interaction_id,
    newValue: { source_type: sourceType, title, utterance_count: utterances.length },
  });

  redirect(`/projects/${projectId}/interactions/${interaction.interaction_id}`);
}

/** EPIC 17, manual half: same anonymise semantics as the scheduled sweep, run on demand. Lead-BA-gated since it's an irreversible redaction. */
export async function purgeInteractionNow(projectId: string, interactionId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const role = await getProjectRole(supabase, projectId, auth.user.id);
  if (!isLead(role)) {
    throw new Error("Only a Lead Business Analyst can purge an interaction.");
  }

  await purgeInteraction(supabase, interactionId, projectId, auth.user.id);

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

export async function mapSpeaker(
  projectId: string,
  interactionId: string,
  formData: FormData
) {
  const utteranceId = String(formData.get("utterance_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const targetId = String(formData.get("target_id") ?? "");

  if (!utteranceId || !targetId || (kind !== "user" && kind !== "stakeholder")) {
    throw new Error("Invalid speaker mapping.");
  }

  const supabase = await getSupabaseServerClient();

  const { error } = await supabase
    .from("utterance")
    .update(
      kind === "user"
        ? { speaker_user_id: targetId, speaker_stakeholder_id: null }
        : { speaker_stakeholder_id: targetId, speaker_user_id: null }
    )
    .eq("utterance_id", utteranceId);

  if (error) {
    throw new Error(`Failed to map speaker: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}
