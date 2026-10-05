"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { searchProject, type RetrievalResult } from "@/lib/ai/search";
import {
  identifyGapsAndContradictions,
  generateBrainstormQuestions,
  generateProposedEdits,
  type BrainstormQuestion,
  type GapFinding,
} from "@/lib/ai/changeAnalysis";

export type { BrainstormQuestion };
import { getAgileStudioClient } from "@/lib/agileStudio/client";
import { sendEmail } from "@/lib/email/resend";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

/**
 * §8 rule 9: cannot close a change request while a blocking clarification
 * it raised is still unanswered. Applied at every terminal transition
 * (Deferred, Rejected, Propagated) rather than only one, since all three
 * end the case.
 */
async function assertNoBlockingClarifications(supabase: SupabaseClient, changeRequestId: string) {
  const { data: links } = await supabase
    .from("trace_link")
    .select("from_object_id")
    .eq("from_object_type", "Clarification")
    .eq("to_object_type", "ChangeRequest")
    .eq("to_object_id", changeRequestId);

  const clarificationIds = (links ?? []).map((l) => l.from_object_id);
  if (clarificationIds.length === 0) return;

  const { data: blocking } = await supabase
    .from("clarification")
    .select("clarification_id")
    .in("clarification_id", clarificationIds)
    .eq("is_blocking", true)
    .not("status", "in", "(Confirmed,Withdrawn)");

  if ((blocking ?? []).length > 0) {
    throw new Error(
      `Cannot close this change request: ${blocking!.length} blocking clarification(s) raised from it are still unanswered.`
    );
  }
}

/** §3.7 stage 1: Intake. */
export async function createChangeRequest(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const requestedBy = String(formData.get("requested_by") ?? "").trim();
  const urgency = String(formData.get("urgency") ?? "").trim();

  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: changeRequest, error } = await supabase
    .from("change_request")
    .insert({
      project_id: projectId,
      title,
      description: description || null,
      requested_by: requestedBy || null,
      urgency: urgency || null,
      status: "Intake",
    })
    .select("change_request_id")
    .single();
  if (error) throw new Error(`Failed to create change request: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "ChangeRequest",
    targetObjectId: changeRequest.change_request_id,
    newValue: { title },
  });

  redirect(`/projects/${projectId}/changes/${changeRequest.change_request_id}`);
}

export async function updateChangeRequest(projectId: string, changeRequestId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const urgency = String(formData.get("urgency") ?? "").trim();

  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("change_request")
    .update({ title, description: description || null, urgency: urgency || null })
    .eq("change_request_id", changeRequestId)
    .eq("status", "Intake");
  if (error) throw new Error(`Failed to update change request: ${error.message}`);

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

export interface ChangeImpactAnalysisResult {
  affected: RetrievalResult[];
  gaps: GapFinding[];
}

/**
 * §3.7 stage 2 (Analyse): retrieval (EPIC 10) finds affected content,
 * an LLM call identifies gaps/contradictions, and coverage-by-area
 * confidence reporting flags any functional area with unconfirmed
 * decisions among the affected set. Re-running replaces prior findings
 * rather than appending, so the findings list always reflects the latest
 * pass over the current description.
 */
export async function runChangeImpactAnalysis(
  projectId: string,
  changeRequestId: string
): Promise<ChangeImpactAnalysisResult> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: changeRequest, error: fetchError } = await supabase
    .from("change_request")
    .select("description, status")
    .eq("change_request_id", changeRequestId)
    .single();
  if (fetchError) throw new Error(`Failed to load change request: ${fetchError.message}`);
  if (!changeRequest.description) {
    throw new Error("Add a description before running impact analysis.");
  }

  const { data: project } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();

  const affected = project?.embedding_provider && project?.embedding_model
    ? await searchProject(supabase, projectId, user.id, changeRequest.description, [
        "Decision",
        "KnowledgeNode",
        "UserStory",
      ], 15)
    : [];

  const model = await resolveUserLanguageModel(user.id);
  const gaps = await identifyGapsAndContradictions(
    model,
    changeRequest.description,
    affected.map((a) => ({ objectType: a.object_type, objectId: a.object_id, snippet: a.snippet }))
  );

  await supabase.from("impact_finding").delete().eq("change_request_id", changeRequestId);

  interface ImpactFindingRow {
    change_request_id: string;
    finding_type: "Affected" | "Undefined" | "Contradiction" | "LowCoverage";
    target_object_type: string | null;
    target_object_id: string | null;
    detail: string;
    confidence_score: number | null;
  }

  const affectedRows: ImpactFindingRow[] = affected.map((a) => ({
    change_request_id: changeRequestId,
    finding_type: "Affected",
    target_object_type: a.object_type,
    target_object_id: a.object_id,
    detail: a.snippet,
    confidence_score: a.relevance_score,
  }));

  const gapRows: ImpactFindingRow[] = gaps.map((g) => ({
    change_request_id: changeRequestId,
    finding_type: g.findingType,
    target_object_type: null,
    target_object_id: null,
    detail: g.detail,
    confidence_score: g.confidenceScore,
  }));

  const functionalAreaIds = [...new Set(affected.filter((a) => a.object_type === "Decision").map((a) => a.object_id))];
  const coverageRows: ImpactFindingRow[] = [];
  for (const decisionId of functionalAreaIds) {
    const { data: decision } = await supabase
      .from("decision")
      .select("functional_area_id")
      .eq("decision_id", decisionId)
      .maybeSingle();
    const areaId = decision?.functional_area_id;
    if (!areaId) continue;

    const { count: total } = await supabase
      .from("decision")
      .select("decision_id", { count: "exact", head: true })
      .eq("functional_area_id", areaId);
    const { count: confirmed } = await supabase
      .from("decision")
      .select("decision_id", { count: "exact", head: true })
      .eq("functional_area_id", areaId)
      .eq("status", "Confirmed");

    const coverage = total ? (confirmed ?? 0) / total : 0;
    if (coverage < 0.8) {
      coverageRows.push({
        change_request_id: changeRequestId,
        finding_type: "LowCoverage",
        target_object_type: "KnowledgeNode",
        target_object_id: areaId,
        detail: `${confirmed ?? 0}/${total} decisions confirmed in this functional area.`,
        confidence_score: coverage,
      });
    }
  }

  if (affectedRows.length + gapRows.length + coverageRows.length > 0) {
    const { error: insertError } = await supabase
      .from("impact_finding")
      .insert([...affectedRows, ...gapRows, ...coverageRows]);
    if (insertError) throw new Error(`Failed to save findings: ${insertError.message}`);
  }

  if (changeRequest.status === "Intake") {
    await supabase.from("change_request").update({ status: "Analysing" }).eq("change_request_id", changeRequestId);
  }

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
  return { affected, gaps };
}

/** BA disposition on one finding. RaisedAsClarification spawns a real Clarification Item case (EPIC 7) immediately rather than waiting for the Brainstorm pass. */
export async function disposeFinding(projectId: string, changeRequestId: string, formData: FormData) {
  const findingId = String(formData.get("finding_id") ?? "");
  const disposition = String(formData.get("disposition") ?? "");

  if (!["Accepted", "Dismissed", "RaisedAsClarification"].includes(disposition)) {
    throw new Error("Invalid disposition.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: finding, error: fetchError } = await supabase
    .from("impact_finding")
    .select("detail, finding_type")
    .eq("finding_id", findingId)
    .single();
  if (fetchError) throw new Error(`Failed to load finding: ${fetchError.message}`);

  const { error: updateError } = await supabase
    .from("impact_finding")
    .update({ ba_disposition: disposition })
    .eq("finding_id", findingId);
  if (updateError) throw new Error(`Failed to update finding: ${updateError.message}`);

  if (disposition === "RaisedAsClarification") {
    await raiseClarification(supabase, projectId, changeRequestId, user.id, {
      question: finding.detail ?? "Clarification needed.",
      audienceType: "InternalBusiness",
      isBlocking: finding.finding_type === "Contradiction",
    });
  }

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

export async function moveToBrainstorm(projectId: string, changeRequestId: string) {
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("change_request")
    .update({ status: "Brainstorm" })
    .eq("change_request_id", changeRequestId)
    .eq("status", "Analysing");
  if (error) throw new Error(`Failed to advance: ${error.message}`);

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

/** §3.7 stage 3 (Brainstorm): LLM-drafted question list, not persisted — the BA edits before anything becomes a real Clarification Item. */
export async function generateQuestions(
  projectId: string,
  changeRequestId: string
): Promise<BrainstormQuestion[]> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: changeRequest, error: fetchError } = await supabase
    .from("change_request")
    .select("description")
    .eq("change_request_id", changeRequestId)
    .single();
  if (fetchError) throw new Error(`Failed to load change request: ${fetchError.message}`);

  const { data: findings } = await supabase
    .from("impact_finding")
    .select("finding_type, detail")
    .eq("change_request_id", changeRequestId)
    .or("ba_disposition.is.null,ba_disposition.neq.Dismissed");

  const model = await resolveUserLanguageModel(user.id);
  return generateBrainstormQuestions(
    model,
    changeRequest.description ?? "",
    (findings ?? []).map((f) => ({ findingType: f.finding_type, detail: f.detail ?? "" }))
  );
}

async function raiseClarification(
  supabase: SupabaseClient,
  projectId: string,
  changeRequestId: string,
  chasingUserId: string,
  input: { question: string; audienceType: string; isBlocking: boolean }
) {
  const { data: clarification, error } = await supabase
    .from("clarification")
    .insert({
      project_id: projectId,
      question: input.question,
      audience_type: input.audienceType,
      chasing_user_id: chasingUserId,
      is_blocking: input.isBlocking,
      status: "Raised",
    })
    .select("clarification_id")
    .single();
  if (error) throw new Error(`Failed to raise clarification: ${error.message}`);

  await supabase.from("trace_link").insert({
    project_id: projectId,
    from_object_type: "Clarification",
    from_object_id: clarification.clarification_id,
    to_object_type: "ChangeRequest",
    to_object_id: changeRequestId,
    link_type: "DerivedFrom",
  });

  return clarification.clarification_id;
}

/** BA-edited question from the Brainstorm list becomes a real Clarification Item case. */
export async function raiseClarificationFromChangeRequest(
  projectId: string,
  changeRequestId: string,
  formData: FormData
) {
  const question = String(formData.get("question") ?? "").trim();
  const audienceType = String(formData.get("audience_type") ?? "");
  const isBlocking = formData.get("is_blocking") === "on";

  if (!question) {
    throw new Error("Question text is required.");
  }
  if (!["Client", "Architect", "InternalBusiness", "DeliveryTeam"].includes(audienceType)) {
    throw new Error("Invalid audience.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  await raiseClarification(supabase, projectId, changeRequestId, user.id, { question, audienceType, isBlocking });

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

export async function moveToDecide(projectId: string, changeRequestId: string) {
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("change_request")
    .update({ status: "Decision" })
    .eq("change_request_id", changeRequestId)
    .eq("status", "Brainstorm");
  if (error) throw new Error(`Failed to advance: ${error.message}`);

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

/** §3.7 stage 4 (Decide). Deferred/Rejected are terminal here, so the closure guard (§8 rule 9) applies; Accepted proceeds to Propagate, where the guard applies again at actual completion. */
export async function decideChangeRequest(projectId: string, changeRequestId: string, formData: FormData) {
  const outcome = String(formData.get("outcome") ?? "");
  const rationale = String(formData.get("rationale") ?? "").trim();

  if (!["Accepted", "Deferred", "Rejected"].includes(outcome)) {
    throw new Error("Invalid outcome.");
  }
  if (!rationale) {
    throw new Error("Rationale is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  if (outcome === "Deferred" || outcome === "Rejected") {
    await assertNoBlockingClarifications(supabase, changeRequestId);
  }

  const { error } = await supabase
    .from("change_request")
    .update({ status: outcome, decision_rationale: rationale })
    .eq("change_request_id", changeRequestId)
    .eq("status", "Decision");
  if (error) throw new Error(`Failed to record decision: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "ChangeRequest",
    targetObjectId: changeRequestId,
    newValue: { status: outcome, decision_rationale: rationale },
  });

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

const EPIC_EDITABLE_FIELDS = ["title", "business_objective", "in_scope", "out_of_scope"] as const;
const STORY_EDITABLE_FIELDS = [
  "title",
  "description",
  "assumptions",
  "exclusions",
  "nfr_performance",
  "nfr_security",
  "nfr_accessibility",
  "nfr_audit",
] as const;

/** §3.7 stage 5 (Propagate), part 1: drafts edits for every Epic/UserStory finding the BA accepted during Analyse. Only reachable once the change is Accepted. */
export async function generateEditsForChangeRequest(projectId: string, changeRequestId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: changeRequest, error: fetchError } = await supabase
    .from("change_request")
    .select("description, status")
    .eq("change_request_id", changeRequestId)
    .single();
  if (fetchError) throw new Error(`Failed to load change request: ${fetchError.message}`);
  if (changeRequest.status !== "Accepted") {
    throw new Error(`Cannot propagate a change request in status ${changeRequest.status}.`);
  }

  const { data: findings } = await supabase
    .from("impact_finding")
    .select("target_object_type, target_object_id")
    .eq("change_request_id", changeRequestId)
    .eq("finding_type", "Affected")
    .eq("ba_disposition", "Accepted")
    .in("target_object_type", ["Epic", "UserStory"]);

  const model = await resolveUserLanguageModel(user.id);
  const newEdits: {
    change_request_id: string;
    target_object_type: string;
    target_object_id: string;
    field_name: string;
    current_value: string | null;
    proposed_value: string;
    rationale: string | null;
  }[] = [];

  for (const finding of findings ?? []) {
    if (finding.target_object_type === "Epic") {
      const { data: epic } = await supabase
        .from("epic")
        .select("title, business_objective, in_scope, out_of_scope")
        .eq("epic_id", finding.target_object_id)
        .maybeSingle();
      if (!epic) continue;

      const changes = await generateProposedEdits(model, changeRequest.description ?? "", {
        objectType: "Epic",
        currentFields: epic,
      });

      for (const c of changes) {
        if (!EPIC_EDITABLE_FIELDS.includes(c.fieldName as (typeof EPIC_EDITABLE_FIELDS)[number])) continue;
        newEdits.push({
          change_request_id: changeRequestId,
          target_object_type: "Epic",
          target_object_id: finding.target_object_id,
          field_name: c.fieldName,
          current_value: c.currentValue,
          proposed_value: c.proposedValue,
          rationale: c.rationale,
        });
      }
    } else if (finding.target_object_type === "UserStory") {
      const { data: story } = await supabase
        .from("user_story")
        .select("title, description, assumptions, exclusions, nfr_performance, nfr_security, nfr_accessibility, nfr_audit")
        .eq("user_story_id", finding.target_object_id)
        .maybeSingle();
      if (!story) continue;

      const changes = await generateProposedEdits(model, changeRequest.description ?? "", {
        objectType: "UserStory",
        currentFields: story,
      });

      for (const c of changes) {
        if (!STORY_EDITABLE_FIELDS.includes(c.fieldName as (typeof STORY_EDITABLE_FIELDS)[number])) continue;
        newEdits.push({
          change_request_id: changeRequestId,
          target_object_type: "UserStory",
          target_object_id: finding.target_object_id,
          field_name: c.fieldName,
          current_value: c.currentValue,
          proposed_value: c.proposedValue,
          rationale: c.rationale,
        });
      }
    }
  }

  if (newEdits.length > 0) {
    const { error: insertError } = await supabase.from("proposed_edit").insert(newEdits);
    if (insertError) throw new Error(`Failed to save proposed edits: ${insertError.message}`);
  }

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

/** §3.7 stage 5, part 2: BA approves each proposed edit individually before it's written back. */
export async function reviewProposedEdit(projectId: string, changeRequestId: string, formData: FormData) {
  const editId = String(formData.get("proposed_edit_id") ?? "");
  const outcome = String(formData.get("outcome") ?? "");

  if (outcome !== "Approved" && outcome !== "Rejected") {
    throw new Error("Invalid outcome.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: edit, error: fetchError } = await supabase
    .from("proposed_edit")
    .select("*")
    .eq("proposed_edit_id", editId)
    .single();
  if (fetchError) throw new Error(`Failed to load proposed edit: ${fetchError.message}`);
  if (edit.status !== "Pending") {
    throw new Error(`This edit was already ${edit.status.toLowerCase()}.`);
  }

  if (outcome === "Approved") {
    const table = edit.target_object_type === "Epic" ? "epic" : "user_story";
    const idColumn = edit.target_object_type === "Epic" ? "epic_id" : "user_story_id";

    const { error: applyError } = await supabase
      .from(table)
      .update({ [edit.field_name]: edit.proposed_value })
      .eq(idColumn, edit.target_object_id);
    if (applyError) throw new Error(`Failed to apply edit: ${applyError.message}`);

    await enqueueEmbedding(supabase, projectId, edit.target_object_type as "UserStory", edit.target_object_id, user.id);

    const ref = `PROPAGATE-${changeRequestId.slice(0, 8)}`;
    if (edit.target_object_type === "Epic") {
      await getAgileStudioClient().updateEpic({ epicId: edit.target_object_id, ref });
    } else {
      await getAgileStudioClient().updateStory({ storyId: edit.target_object_id, ref });
    }
  }

  const { error: updateError } = await supabase
    .from("proposed_edit")
    .update({ status: outcome, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("proposed_edit_id", editId);
  if (updateError) throw new Error(`Failed to update proposed edit: ${updateError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "ProposedEdit",
    targetObjectId: editId,
    newValue: { status: outcome, field_name: edit.field_name, target_object_id: edit.target_object_id },
  });

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

/** §3.7 stage 5, part 3: email notification to affected delivery team members (EPIC 15). */
export async function sendChangeNotification(projectId: string, changeRequestId: string) {
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { data: changeRequest, error: fetchError } = await supabase
    .from("change_request")
    .select("title, description")
    .eq("change_request_id", changeRequestId)
    .single();
  if (fetchError) throw new Error(`Failed to load change request: ${fetchError.message}`);

  const { data: members } = await supabase
    .from("project_member")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role_name", "DeliveryMember");

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) {
    throw new Error("No delivery team members on this project to notify.");
  }

  const { data: users } = await supabase.from("app_user").select("email").in("user_id", userIds);
  const emails = (users ?? []).map((u) => u.email).filter(Boolean);
  if (emails.length === 0) {
    throw new Error("No email addresses found for delivery team members.");
  }

  await sendEmail({
    to: emails,
    subject: `Change request approved: ${changeRequest.title}`,
    html: `<p>A change request affecting your work has been accepted and propagated.</p><p><strong>${changeRequest.title}</strong></p><p>${changeRequest.description ?? ""}</p>`,
  });

  const { error: updateError } = await supabase
    .from("change_request")
    .update({ notified_at: new Date().toISOString() })
    .eq("change_request_id", changeRequestId);
  if (updateError) throw new Error(`Failed to record notification: ${updateError.message}`);

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}

/** §3.7 stage 5, closing: §8 rule 9 guard applies here too since this is the terminal transition out of Accepted. */
export async function completePropagation(projectId: string, changeRequestId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  await assertNoBlockingClarifications(supabase, changeRequestId);

  const { count: pendingEdits } = await supabase
    .from("proposed_edit")
    .select("proposed_edit_id", { count: "exact", head: true })
    .eq("change_request_id", changeRequestId)
    .eq("status", "Pending");
  if (pendingEdits) {
    throw new Error(`${pendingEdits} proposed edit(s) still need a decision before closing.`);
  }

  const { error } = await supabase
    .from("change_request")
    .update({ status: "Propagated" })
    .eq("change_request_id", changeRequestId)
    .eq("status", "Accepted");
  if (error) throw new Error(`Failed to close change request: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "ChangeRequest",
    targetObjectId: changeRequestId,
    newValue: { status: "Propagated" },
  });

  revalidatePath(`/projects/${projectId}/changes/${changeRequestId}`);
}
