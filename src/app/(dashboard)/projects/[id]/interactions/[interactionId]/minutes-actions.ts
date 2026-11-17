"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/projects/access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { generateMinutesDraft } from "@/lib/ai/minutes";
import { sendEmail } from "@/lib/email/resend";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";
import { generateAckToken, hashAckToken, isWithinAckWindow } from "@/lib/minutes/ackToken";
import { getAppBaseUrl } from "@/lib/appUrl";
import { isValidEmail } from "@/lib/validation";
import { revertMinutesDispute } from "@/lib/minutes/dispute";
import { resolveOwnerUserId } from "@/lib/minutes/resolveOwner";
import { sanitizeMinutesHtml } from "@/lib/html/sanitizeMinutes";

type Supa = Awaited<ReturnType<typeof getSupabaseServerClient>>;


export async function generateMinutes(projectId: string, interactionId: string) {
  const supabase = await getSupabaseServerClient();
  const { user } = await requireProjectAccess(supabase, projectId, "author");

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
    body_html: sanitizeMinutesHtml(draft.bodyHtml),
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
  const bodyHtml = sanitizeMinutesHtml(String(formData.get("body_html") ?? "").trim());

  const supabase = await getSupabaseServerClient();
  await requireProjectAccess(supabase, projectId, "author");

  const { error } = await supabase
    .from("minutes_document")
    .update({ subject, body_html: bodyHtml })
    .eq("minutes_id", minutesId)
    .eq("project_id", projectId)
    .in("status", ["Draft", "InReview"]);

  if (error) {
    throw new Error(`Failed to update minutes: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

const MAX_RECIPIENTS = 50;

async function getAllowedRecipientEmails(supabase: Supa, projectId: string): Promise<Set<string>> {
  const [{ data: members }, { data: stakeholders }] = await Promise.all([
    supabase.from("project_member").select("app_user(email)").eq("project_id", projectId),
    supabase.from("stakeholder").select("email").eq("project_id", projectId),
  ]);
  const emails = new Set<string>();
  for (const m of members ?? []) {
    const user = Array.isArray(m.app_user) ? m.app_user[0] : m.app_user;
    if (user?.email) emails.add(String(user.email).toLowerCase());
  }
  for (const s of stakeholders ?? []) {
    if (s.email) emails.add(String(s.email).toLowerCase());
  }
  return emails;
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
  const requested = formData
    .getAll("recipients")
    .map((r) => String(r).trim().toLowerCase())
    .filter(Boolean);
  const recipients = [...new Set(requested)];

  if (recipients.length === 0) {
    throw new Error("Select at least one recipient.");
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(`Send to at most ${MAX_RECIPIENTS} recipients at once.`);
  }
  const invalid = recipients.filter((r) => !isValidEmail(r));
  if (invalid.length > 0) {
    throw new Error(`Not a valid email address: ${invalid.join(", ")}`);
  }

  const supabase = await getSupabaseServerClient();
  const { user } = await requireProjectAccess(supabase, projectId, "lead");

  // Minutes only go to the project's own members and stakeholders, the same
  // list the page offers, so this action cannot be used to send mail from
  // the app's domain to arbitrary addresses.
  const allowed = await getAllowedRecipientEmails(supabase, projectId);
  const notAllowed = recipients.filter((r) => !allowed.has(r));
  if (notAllowed.length > 0) {
    throw new Error(`Not a project member or stakeholder: ${notAllowed.join(", ")}`);
  }

  const { data: minutes, error: minutesError } = await supabase
    .from("minutes_document")
    .select("subject, body_html, status, interaction_id")
    .eq("minutes_id", minutesId)
    .eq("project_id", projectId)
    .single();

  if (minutesError) {
    throw new Error(`Failed to load minutes: ${minutesError.message}`);
  }
  if (minutes.interaction_id !== interactionId) {
    throw new Error("These minutes belong to a different interaction.");
  }
  // Prevents distributing twice (duplicate emails, duplicate commits) and
  // re-distributing disputed minutes without going back through Confirm.
  if (minutes.status !== "Draft" && minutes.status !== "InReview") {
    throw new Error(`Minutes in status ${minutes.status} cannot be approved again.`);
  }

  // Resolve the link base before changing any state, so a missing
  // APP_BASE_URL fails cleanly instead of leaving minutes half-distributed.
  const baseUrl = await getAppBaseUrl();

  const { error: approveError } = await supabase
    .from("minutes_document")
    .update({ status: "Approved", approved_by: user.id })
    .eq("minutes_id", minutesId)
    .eq("project_id", projectId);
  if (approveError) {
    throw new Error(`Failed to approve minutes: ${approveError.message}`);
  }

  const { error: distributeError } = await supabase
    .from("minutes_document")
    .update({ status: "Distributed", distributed_at: new Date().toISOString() })
    .eq("minutes_id", minutesId)
    .eq("project_id", projectId);
  if (distributeError) {
    throw new Error(`Failed to mark minutes distributed: ${distributeError.message}`);
  }

  // Each recipient gets their own unguessable ack/dispute link (EPIC 5).
  // Only the token's hash is stored; the raw token exists only in the email.
  const recipientTokens = recipients.map((email) => ({ email, token: generateAckToken() }));

  const { error: recipientsError } = await supabase.from("minutes_recipient").insert(
    recipientTokens.map((r) => ({
      minutes_id: minutesId,
      email: r.email,
      ack_token_hash: hashAckToken(r.token),
    }))
  );
  if (recipientsError) {
    throw new Error(`Failed to record recipients: ${recipientsError.message}`);
  }

  const safeBody = sanitizeMinutesHtml(minutes.body_html);
  for (const recipient of recipientTokens) {
    const ackLink = `${baseUrl}/minutes/${recipient.token}`;
    await sendEmail({
      to: [recipient.email],
      subject: minutes.subject ?? "Minutes of meeting",
      html: `${safeBody}
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
        <p style="font-family:sans-serif;font-size:13px;color:#4b5563;">
          Please review and acknowledge these minutes, or flag any issues, here:
          <a href="${ackLink}">${ackLink}</a>
        </p>`,
    });
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
      const ownerId = await resolveOwnerUserId(
        supabase,
        projectId,
        candidate.resolved_owner_user_id,
        candidate.suggested_owner,
        committedBy
      );
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

      await enqueueEmbedding(supabase, projectId, "ActionItem", actionItem.action_item_id, committedBy);
    } else if (candidate.candidate_type === "Clarification") {
      const chasingId = await resolveOwnerUserId(
        supabase,
        projectId,
        candidate.resolved_owner_user_id,
        candidate.suggested_owner,
        committedBy
      );
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

      await enqueueEmbedding(supabase, projectId, "Clarification", clarification.clarification_id, committedBy);
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
  const { user } = await requireProjectAccess(supabase, projectId, "author");

  const { data: minutes, error: minutesError } = await supabase
    .from("minutes_document")
    .select("status, interaction_id, ack_window_ends_at")
    .eq("minutes_id", minutesId)
    .eq("project_id", projectId)
    .single();
  if (minutesError) throw new Error(`Failed to load minutes: ${minutesError.message}`);
  if (minutes.interaction_id !== interactionId) {
    throw new Error("These minutes belong to a different interaction.");
  }
  if (minutes.status !== "Distributed") {
    throw new Error(`Only distributed minutes can be disputed (current status: ${minutes.status}).`);
  }
  if (!isWithinAckWindow(minutes.ack_window_ends_at)) {
    throw new Error("The acknowledgement window for these minutes has closed.");
  }

  const { decisionIds } = await revertMinutesDispute(supabase, { minutesId, interactionId, disputeNote });

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

