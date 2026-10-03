"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

/** §3.4 stage 2 — surfaces in call-prep views (EPIC 13, not built yet). */
export async function markPrepared(projectId: string, formData: FormData) {
  const clarificationId = String(formData.get("clarification_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("clarification")
    .update({ status: "Prepared" })
    .eq("clarification_id", clarificationId)
    .eq("status", "Raised");
  if (error) throw new Error(`Failed to update clarification: ${error.message}`);

  revalidatePath(`/projects/${projectId}/clarifications`);
}

/** §3.4 stage 3. */
export async function markAsked(projectId: string, formData: FormData) {
  const clarificationId = String(formData.get("clarification_id") ?? "");
  const askedChannel = String(formData.get("asked_channel") ?? "").trim();
  const askedOn = String(formData.get("asked_on") ?? "") || null;

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("clarification")
    .update({ status: "Asked", asked_channel: askedChannel || null, asked_on: askedOn })
    .eq("clarification_id", clarificationId)
    .in("status", ["Raised", "Prepared"]);
  if (error) throw new Error(`Failed to update clarification: ${error.message}`);

  revalidatePath(`/projects/${projectId}/clarifications`);
}

/**
 * §3.4 stage 4: "Answer is treated as a candidate decision." Creates a real
 * decision row at Candidate status now — BA confirmation (confirmAnswer)
 * is a separate, explicit step, matching stage 5 rather than collapsing
 * both into one action.
 */
export async function answerClarification(projectId: string, formData: FormData) {
  const clarificationId = String(formData.get("clarification_id") ?? "");
  const answerText = String(formData.get("answer_text") ?? "").trim();
  const answeredBy = String(formData.get("answered_by") ?? "").trim();

  if (!answerText || !answeredBy) {
    throw new Error("Answer text and who gave it are required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: clarification, error: fetchError } = await supabase
    .from("clarification")
    .select("question, functional_area_id, source_utterance_id")
    .eq("clarification_id", clarificationId)
    .single();
  if (fetchError) throw new Error(`Failed to load clarification: ${fetchError.message}`);

  const { data: decision, error: decisionError } = await supabase
    .from("decision")
    .insert({
      project_id: projectId,
      statement: answerText,
      rationale: `Answer to: ${clarification.question}`,
      functional_area_id: clarification.functional_area_id,
      source_utterance_id: clarification.source_utterance_id,
      status: "Candidate",
    })
    .select("decision_id")
    .single();
  if (decisionError) throw new Error(`Failed to record answer as decision: ${decisionError.message}`);

  const { error: updateError } = await supabase
    .from("clarification")
    .update({
      status: "Answered",
      answer_text: answerText,
      answered_by: answeredBy,
      answered_on: new Date().toISOString().slice(0, 10),
      resulting_decision_id: decision.decision_id,
    })
    .eq("clarification_id", clarificationId);
  if (updateError) throw new Error(`Failed to update clarification: ${updateError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "Clarification",
    targetObjectId: clarificationId,
    newValue: { status: "Answered", answer_text: answerText, answered_by: answeredBy },
  });

  await enqueueEmbedding(supabase, projectId, "Decision", decision.decision_id, user.id);

  revalidatePath(`/projects/${projectId}/clarifications`);
}

/**
 * §3.4 stage 5: writes the answer to the charter by confirming its
 * decision. Not subject to the Provisional/acknowledgement-window path —
 * §8 rule 3 scopes that specifically to decisions derived from distributed
 * minutes. "Dependent stories and change requests are notified" is a no-op
 * for now: neither EPIC 11 (User Story Authoring) nor EPIC 12 (Change
 * Request Analysis) exists yet for there to be anything to notify.
 */
export async function confirmAnswer(projectId: string, formData: FormData) {
  const clarificationId = String(formData.get("clarification_id") ?? "");

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: clarification, error: fetchError } = await supabase
    .from("clarification")
    .select("resulting_decision_id, status")
    .eq("clarification_id", clarificationId)
    .single();
  if (fetchError) throw new Error(`Failed to load clarification: ${fetchError.message}`);
  if (clarification.status !== "Answered") {
    throw new Error(`Cannot confirm a clarification in status ${clarification.status}.`);
  }
  if (!clarification.resulting_decision_id) {
    throw new Error("No answer recorded yet.");
  }

  const { error: decisionError } = await supabase
    .from("decision")
    .update({ status: "Confirmed", confirmed_by: user.id, confirmed_at: new Date().toISOString() })
    .eq("decision_id", clarification.resulting_decision_id);
  if (decisionError) throw new Error(`Failed to confirm decision: ${decisionError.message}`);

  const { error: clarificationError } = await supabase
    .from("clarification")
    .update({ status: "Confirmed" })
    .eq("clarification_id", clarificationId);
  if (clarificationError) throw new Error(`Failed to confirm clarification: ${clarificationError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Confirmed",
    targetObjectType: "Clarification",
    targetObjectId: clarificationId,
    newValue: { status: "Confirmed", decision_id: clarification.resulting_decision_id },
  });

  revalidatePath(`/projects/${projectId}/clarifications`);
}

export async function withdrawClarification(projectId: string, formData: FormData) {
  const clarificationId = String(formData.get("clarification_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("clarification")
    .update({ status: "Withdrawn" })
    .eq("clarification_id", clarificationId)
    .neq("status", "Confirmed");
  if (error) throw new Error(`Failed to withdraw clarification: ${error.message}`);

  revalidatePath(`/projects/${projectId}/clarifications`);
}
