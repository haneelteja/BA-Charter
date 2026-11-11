"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { parseUtterances } from "@/lib/transcript/parse";
import { cleanTranscript, type CleanedUtterance } from "@/lib/ai/transcriptCleaner";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";

export type CreateInteractionFromChatResult =
  | { ok: true; interactionId: string; title: string; utteranceCount: number }
  | { ok: false; error: string };

function deriveTitle(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  const base = firstLine || "Imported chat transcript";
  return base.length > 80 ? `${base.slice(0, 77)}...` : base;
}

/**
 * Bridges the project Chat tab into the existing interaction-capture
 * pipeline (Interactions → extraction → Minutes) instead of duplicating it:
 * a long pasted chat/meeting dump becomes a real `interaction` row with its
 * noise stripped by `cleanTranscript`, extraction is auto-triggered, and
 * everything after that (reviewing candidates, confirming, generating
 * minutes) goes through the same human-reviewed flow as any other
 * interaction — official project records never get written from an
 * unreviewed paste.
 */
export async function createInteractionFromChatMessage(
  projectId: string,
  rawText: string
): Promise<CreateInteractionFromChatResult> {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: "Not signed in." };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: "Nothing to save." };
  }

  let utterances: CleanedUtterance[];
  try {
    const model = await resolveUserLanguageModel(auth.user.id);
    utterances = await cleanTranscript({ model, rawText: trimmed });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to process the transcript." };
  }

  if (utterances.length === 0) {
    // The cleaner found nothing it confidently recognized as chat chrome to
    // drop, but also nothing it was confident enough to keep — fall back to
    // the same plain parser the manual Interactions form uses rather than
    // silently discarding the content.
    utterances = parseUtterances(trimmed);
  }

  const { data: project, error: projectError } = await supabase
    .from("project")
    .select("retention_days")
    .eq("project_id", projectId)
    .single();
  if (projectError) {
    return { ok: false, error: `Failed to load project: ${projectError.message}` };
  }

  const purgeAfter = new Date();
  purgeAfter.setDate(purgeAfter.getDate() + (project.retention_days ?? 365));
  const title = deriveTitle(trimmed);

  const { data: interaction, error: interactionError } = await supabase
    .from("interaction")
    .insert({
      project_id: projectId,
      source_type: "Chat",
      title,
      occurred_at: new Date().toISOString(),
      ingested_by: auth.user.id,
      processing_status: "Received",
      purge_after: purgeAfter.toISOString().slice(0, 10),
    })
    .select("interaction_id")
    .single();
  if (interactionError) {
    return { ok: false, error: `Failed to create interaction: ${interactionError.message}` };
  }

  if (utterances.length > 0) {
    const { data: insertedUtterances, error: utteranceError } = await supabase
      .from("utterance")
      .insert(
        utterances.map((u, i) => ({
          interaction_id: interaction.interaction_id,
          sequence_no: i,
          speaker_label: u.speakerLabel,
          content: u.content,
        }))
      )
      .select("utterance_id");
    if (utteranceError) {
      return { ok: false, error: `Failed to store utterances: ${utteranceError.message}` };
    }

    for (const u of insertedUtterances ?? []) {
      await enqueueEmbedding(supabase, projectId, "Utterance", u.utterance_id, auth.user.id);
    }
  }

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
    newValue: { source_type: "Chat", title, utterance_count: utterances.length },
  });

  await enqueueJob("extract_candidates", {
    projectId,
    interactionId: interaction.interaction_id,
    userId: auth.user.id,
  });

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: auth.user.id,
    eventType: "Updated",
    targetObjectType: "Interaction",
    targetObjectId: interaction.interaction_id,
    newValue: { action: "extraction_requested" },
  });

  revalidatePath(`/projects/${projectId}/interactions`);

  return { ok: true, interactionId: interaction.interaction_id, title, utteranceCount: utterances.length };
}
