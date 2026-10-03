"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { generateMinutesDraft } from "@/lib/ai/minutes";
import { sendEmail } from "@/lib/email/resend";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";

type Supa = Awaited<ReturnType<typeof getSupabaseServerClient>>;

async function requireUser(supabase: Supa) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

/**
 * §8 rule 8: action items and clarifications must resolve to a named
 * person, but extraction only produces a free-text suggestedOwner. There's
 * no fuzzy-matching UI yet, so this tries an exact case-insensitive match
 * against project members' full names and otherwise falls back to whoever
 * is running the commit (the approving Lead BA) — a safe default that keeps
 * the NOT NULL/CHECK constraints satisfied, not a real resolution step.
 * Revisit once there's a proper owner-assignment UI.
 */
async function resolveOwnerUserId(
  supabase: Supa,
  projectId: string,
  suggestedOwner: string | null,
  fallbackUserId: string
): Promise<string> {
  if (!suggestedOwner) return fallbackUserId;

  const { data: memberRows } = await supabase
    .from("project_member")
    .select("user_id")
    .eq("project_id", projectId);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) return fallbackUserId;

  const { data: matches } = await supabase
    .from("app_user")
    .select("user_id, full_name")
    .in("user_id", memberIds)
    .ilike("full_name", suggestedOwner.trim());

  return matches && matches.length === 1 ? matches[0].user_id : fallbackUserId;
}

export async function generateMinutes(projectId: string, interactionId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: interaction, error: interactionError } = await supabase
    .from("interaction")
    .select("title, processing_status")
    .eq("interaction_id", interactionId)
    .single();

  if (interactionError) {
    throw new Error(`Failed to load interaction: ${interactionError.message}`);
  }
  if (interaction.processing_status !== "Confirmed") {
    throw new Error("Confirm all candidates before generating minutes.");
  }

  const { data: accepted, error: candidatesError } = await supabase
    .from("extraction_candidate")
    .select("candidate_type, statement")
    .eq("interaction_id", interactionId)
    .eq("status", "Accepted");

  if (candidatesError) {
    throw new Error(`Failed to load accepted candidates: ${candidatesError.message}`);
  }

  const byType = (type: string) =>
    (accepted ?? []).filter((c) => c.candidate_type === type).map((c) => c.statement);

  const model = await resolveUserLanguageModel(user.id);
  const draft = await generateMinutesDraft({
    model,
    interactionTitle: interaction.title,
    decisions: byType("Decision"),
    actionItems: byType("ActionItem"),
    clarifications: byType("Clarification"),
  });

  const { error: insertError } = await supabase.from("minutes_document").insert({
    project_id: projectId,
    interaction_id: interactionId,
    subject: draft.subject,
    body_html: draft.bodyHtml,
    status: "Draft",
  });

  if (insertError) {
    throw new Error(`Failed to create minutes draft: ${insertError.message}`);
  }

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

export async function updateMinutes(projectId: string, interactionId: string, formData: FormData) {
  const minutesId = String(formData.get("minutes_id") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyHtml = String(formData.get("body_html") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("minutes_document")
    .update({ subject, body_html: bodyHtml })
    .eq("minutes_id", minutesId)
    .in("status", ["Draft", "InReview"]);

  if (error) {
    throw new Error(`Failed to update minutes: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/**
 * Combines §3.2 stage 4's approve + distribute into one Lead-BA action, and
 * immediately runs stage 5 (Commit to charter) — the requirements describe
 * these as sequential but don't require a human step between approval and
 * distribution, or between distribution and commit.
 */
export async function approveAndDistribute(
  projectId: string,
  interactionId: string,
  formData: FormData
) {
  const minutesId = String(formData.get("minutes_id") ?? "");
  const recipients = formData.getAll("recipients").map(String).filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("Select at least one recipient.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const role = await getProjectRole(supabase, projectId, user.id);
  if (!isLead(role)) {
    throw new Error("Only a Lead Business Analyst can approve minutes.");
  }

  const { data: minutes, error: minutesError } = await supabase
    .from("minutes_document")
    .select("subject, body_html")
    .eq("minutes_id", minutesId)
    .single();

  if (minutesError) {
    throw new Error(`Failed to load minutes: ${minutesError.message}`);
  }

  const { error: approveError } = await supabase
    .from("minutes_document")
    .update({ status: "Approved", approved_by: user.id })
    .eq("minutes_id", minutesId);
  if (approveError) {
    throw new Error(`Failed to approve minutes: ${approveError.message}`);
  }

  await sendEmail({
    to: recipients,
    subject: minutes.subject ?? "Minutes of meeting",
    html: minutes.body_html ?? "",
  });

  const { error: distributeError } = await supabase
    .from("minutes_document")
    .update({ status: "Distributed", distributed_at: new Date().toISOString() })
    .eq("minutes_id", minutesId);
  if (distributeError) {
    throw new Error(`Failed to mark minutes distributed: ${distributeError.message}`);
  }

  const { error: recipientsError } = await supabase.from("minutes_recipient").insert(
    recipients.map((email) => ({ minutes_id: minutesId, email }))
  );
  if (recipientsError) {
    throw new Error(`Failed to record recipients: ${recipientsError.message}`);
  }

  await commitToCharter(supabase, projectId, interactionId, user.id);

  const { data: project } = await supabase
    .from("project")
    .select("mom_ack_window_hours")
    .eq("project_id", projectId)
    .single();

  const runAfter = new Date();
  runAfter.setHours(runAfter.getHours() + (project?.mom_ack_window_hours ?? 48));
  await enqueueJob("promote_provisional_decisions", { projectId, interactionId, minutesId }, { runAfter });

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Published",
    targetObjectType: "MinutesDocument",
    targetObjectId: minutesId,
    newValue: { status: "Distributed", recipients },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/**
 * §3.2 stage 5: write Accepted candidates as real rows — Decisions land
 * Provisional (§8 rule 3), Action Items and Clarifications land directly at
 * their initial live status, since neither has a Candidate-equivalent state
 * in the schema.
 */
async function commitToCharter(
  supabase: Supa,
  projectId: string,
  interactionId: string,
  committedBy: string
) {
  const { data: accepted, error } = await supabase
    .from("extraction_candidate")
    .select("*")
    .eq("interaction_id", interactionId)
    .eq("status", "Accepted")
    .is("resulting_object_id", null);

  if (error) {
    throw new Error(`Failed to load accepted candidates: ${error.message}`);
  }

  for (const candidate of accepted ?? []) {
    if (candidate.candidate_type === "Decision") {
      const { data: decision, error: decisionError } = await supabase
        .from("decision")
        .insert({
          project_id: projectId,
          statement: candidate.statement,
          confidence_score: candidate.confidence_score,
          source_utterance_id: candidate.source_utterance_id,
          supersedes_id: candidate.contradicts_decision_id ?? null,
          status: "Provisional",
        })
        .select("decision_id")
        .single();

      if (decisionError) throw new Error(`Failed to commit decision: ${decisionError.message}`);

      if (candidate.contradicts_decision_id) {
        await supabase
          .from("decision")
          .update({ superseded_by_id: decision.decision_id, status: "Superseded" })
          .eq("decision_id", candidate.contradicts_decision_id);
      }

      await supabase
        .from("extraction_candidate")
        .update({ resulting_object_type: "Decision", resulting_object_id: decision.decision_id })
        .eq("candidate_id", candidate.candidate_id);

      await enqueueEmbedding(supabase, projectId, "Decision", decision.decision_id, committedBy);
    } else if (candidate.candidate_type === "ActionItem") {
      const ownerId = await resolveOwnerUserId(supabase, projectId, candidate.suggested_owner, committedBy);
      const { data: actionItem, error: actionError } = await supabase
        .from("action_item")
        .insert({
          project_id: projectId,
          title: candidate.statement.slice(0, 300),
          detail: candidate.statement,
          owner_user_id: ownerId,
          raised_by: committedBy,
          due_date: candidate.suggested_due_date,
          status: "Open",
          source_utterance_id: candidate.source_utterance_id,
        })
        .select("action_item_id")
        .single();

      if (actionError) throw new Error(`Failed to commit action item: ${actionError.message}`);

      await supabase
        .from("extraction_candidate")
        .update({ resulting_object_type: "ActionItem", resulting_object_id: actionItem.action_item_id })
        .eq("candidate_id", candidate.candidate_id);
    } else if (candidate.candidate_type === "Clarification") {
      const chasingId = await resolveOwnerUserId(supabase, projectId, candidate.suggested_owner, committedBy);
      const { data: clarification, error: clarificationError } = await supabase
        .from("clarification")
        .insert({
          project_id: projectId,
          question: candidate.statement,
          audience_type: "InternalBusiness",
          chasing_user_id: chasingId,
          status: "Raised",
          source_utterance_id: candidate.source_utterance_id,
        })
        .select("clarification_id")
        .single();

      if (clarificationError)
        throw new Error(`Failed to commit clarification: ${clarificationError.message}`);

      await supabase
        .from("extraction_candidate")
        .update({ resulting_object_type: "Clarification", resulting_object_id: clarification.clarification_id })
        .eq("candidate_id", candidate.candidate_id);
    }
    // Risk / ChangeSignal candidates have no persistent home in the schema
    // (see 0010_extraction_candidates.sql) — they stay recorded as Accepted
    // extraction_candidate rows for traceability and are surfaced in the
    // minutes, but nothing further is committed for them.
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: committedBy,
    eventType: "ModelUpdated",
    targetObjectType: "Interaction",
    targetObjectId: interactionId,
    newValue: { action: "committed_to_charter", candidate_count: (accepted ?? []).length },
  });
}

/** §8 rule 4: dispute within the ack window reverts decisions to Candidate and reopens Confirm. */
export async function disputeMinutes(projectId: string, interactionId: string, formData: FormData) {
  const minutesId = String(formData.get("minutes_id") ?? "");
  const disputeNote = String(formData.get("dispute_note") ?? "").trim();

  if (!disputeNote) {
    throw new Error("A dispute note is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error: minutesError } = await supabase
    .from("minutes_document")
    .update({ status: "Disputed", dispute_note: disputeNote })
    .eq("minutes_id", minutesId);
  if (minutesError) {
    throw new Error(`Failed to record dispute: ${minutesError.message}`);
  }

  const { data: committedDecisions, error: candidatesError } = await supabase
    .from("extraction_candidate")
    .select("candidate_id, resulting_object_id")
    .eq("interaction_id", interactionId)
    .eq("resulting_object_type", "Decision")
    .not("resulting_object_id", "is", null);

  if (candidatesError) {
    throw new Error(`Failed to load committed decisions: ${candidatesError.message}`);
  }

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
  if (interactionError) {
    throw new Error(`Failed to reopen interaction: ${interactionError.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "MinutesDocument",
    targetObjectId: minutesId,
    newValue: { status: "Disputed", dispute_note: disputeNote, reverted_decisions: decisionIds },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

