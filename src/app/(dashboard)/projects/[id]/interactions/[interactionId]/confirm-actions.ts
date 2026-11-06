"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { enqueueJob } from "@/lib/jobs/enqueue";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

/** §3.2 stage 2 — enqueued so the 15-minute SLA has room for a long transcript. */
export async function triggerExtraction(projectId: string, interactionId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  await enqueueJob("extract_candidates", { projectId, interactionId, userId: user.id });

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "Interaction",
    targetObjectId: interactionId,
    newValue: { action: "extraction_requested" },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/** Plain accept — refuses a contradicting candidate, which must go through resolveContradiction instead. */
export async function acceptCandidate(projectId: string, interactionId: string, formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const statement = String(formData.get("statement") ?? "").trim();
  const suggestedOwner = String(formData.get("suggested_owner") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: candidate, error: fetchError } = await supabase
    .from("extraction_candidate")
    .select("contradicts_decision_id")
    .eq("candidate_id", candidateId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to load candidate: ${fetchError.message}`);
  }
  if (candidate.contradicts_decision_id) {
    throw new Error("This candidate contradicts an existing decision and requires Lead BA resolution.");
  }

  const { error } = await supabase
    .from("extraction_candidate")
    .update({
      status: "Accepted",
      statement: statement || undefined,
      suggested_owner: suggestedOwner || null,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("candidate_id", candidateId);

  if (error) {
    throw new Error(`Failed to accept candidate: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Confirmed",
    targetObjectType: "ExtractionCandidate",
    targetObjectId: candidateId,
    newValue: { status: "Accepted", statement },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

export async function rejectCandidate(projectId: string, interactionId: string, formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error } = await supabase
    .from("extraction_candidate")
    .update({ status: "Rejected", decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("candidate_id", candidateId);

  if (error) {
    throw new Error(`Failed to reject candidate: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "ExtractionCandidate",
    targetObjectId: candidateId,
    newValue: { status: "Rejected" },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/** Revert a pre-accepted candidate back to Pending — §3.2: "may be reverted." */
export async function revertCandidate(projectId: string, interactionId: string, formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error } = await supabase
    .from("extraction_candidate")
    .update({ status: "Pending", decided_by: null, decided_at: null })
    .eq("candidate_id", candidateId);

  if (error) {
    throw new Error(`Failed to revert candidate: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "ExtractionCandidate",
    targetObjectId: candidateId,
    newValue: { status: "Pending", reverted: true },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/** BPMN Task_Resolve — Lead BA only. */
export async function resolveContradiction(projectId: string, interactionId: string, formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const resolutionNote = String(formData.get("resolution_note") ?? "").trim();

  if (decision !== "accept" && decision !== "reject") {
    throw new Error("Invalid resolution decision.");
  }
  if (!resolutionNote) {
    throw new Error("A resolution note is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const role = await getProjectRole(supabase, projectId, user.id);
  if (!isLead(role)) {
    throw new Error("Only a Lead Business Analyst can resolve a contradiction.");
  }

  const { error } = await supabase
    .from("extraction_candidate")
    .update({
      status: decision === "accept" ? "Accepted" : "Rejected",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("candidate_id", candidateId);

  if (error) {
    throw new Error(`Failed to resolve contradiction: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "ConflictResolved",
    targetObjectType: "ExtractionCandidate",
    targetObjectId: candidateId,
    newValue: { decision, resolution_note: resolutionNote },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/**
 * EPIC 6 follow-up: merges two or more Pending candidates of the same type
 * into one new Pending candidate, which then goes through the normal
 * accept/reject flow like any other. The originals are marked Merged
 * (terminal, not deleted) so they stay in the audit trail and the Decided
 * list, linked both ways via merged_from_candidate_ids/merged_into_candidate_id.
 * Confidence is averaged across the merged set; source_utterance_id and
 * suggested_owner/due_date carry over from whichever merged candidate has
 * them first (earliest created_at) — the result can still only point to
 * one source utterance, same structural limit as every committed
 * decision/action_item/clarification row downstream.
 *
 * Takes FormData via a real <form action> submission (MergeCandidatesPanel
 * renders the hidden candidate_ids inputs from its own selection state,
 * inside one real <form>) rather than being called directly as a plain
 * async function from client code — kept consistent with every other
 * action in this file, which all go through a real form submission.
 */
export async function mergeCandidates(projectId: string, interactionId: string, formData: FormData) {
  const candidateIds = formData.getAll("candidate_ids").map(String).filter(Boolean);
  const mergedStatement = String(formData.get("merged_statement") ?? "").trim();

  if (candidateIds.length < 2) {
    throw new Error("Select at least two candidates to merge.");
  }
  if (!mergedStatement) {
    throw new Error("Write the combined statement before merging.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: candidates, error: fetchError } = await supabase
    .from("extraction_candidate")
    .select("*")
    .in("candidate_id", candidateIds)
    .order("created_at", { ascending: true });
  if (fetchError) throw new Error(`Failed to load candidates: ${fetchError.message}`);
  if (!candidates || candidates.length !== candidateIds.length) {
    throw new Error("One or more selected candidates could not be found.");
  }
  if (candidates.some((c) => c.status !== "Pending")) {
    throw new Error("Only Pending candidates can be merged.");
  }
  if (new Set(candidates.map((c) => c.candidate_type)).size > 1) {
    throw new Error("Candidates of different types can't be merged.");
  }

  const avgConfidence =
    candidates.reduce((sum, c) => sum + Number(c.confidence_score), 0) / candidates.length;
  const firstWith = <K extends keyof (typeof candidates)[number]>(key: K) =>
    candidates.find((c) => c[key] != null)?.[key] ?? null;

  const { data: merged, error: insertError } = await supabase
    .from("extraction_candidate")
    .insert({
      project_id: projectId,
      interaction_id: interactionId,
      candidate_type: candidates[0].candidate_type,
      statement: mergedStatement,
      suggested_owner: firstWith("suggested_owner"),
      suggested_due_date: firstWith("suggested_due_date"),
      functional_area_hint: firstWith("functional_area_hint"),
      confidence_score: avgConfidence,
      source_utterance_id: firstWith("source_utterance_id"),
      status: "Pending",
      merged_from_candidate_ids: candidateIds,
    })
    .select("candidate_id")
    .single();
  if (insertError) throw new Error(`Failed to create merged candidate: ${insertError.message}`);

  const { error: updateError } = await supabase
    .from("extraction_candidate")
    .update({
      status: "Merged",
      merged_into_candidate_id: merged.candidate_id,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .in("candidate_id", candidateIds);
  if (updateError) throw new Error(`Failed to mark originals merged: ${updateError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "ExtractionCandidate",
    targetObjectId: merged.candidate_id,
    newValue: { action: "merged", from_candidate_ids: candidateIds, statement: mergedStatement },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/**
 * EPIC 6 follow-up: splits one Pending candidate into two or more new
 * Pending candidates (one per non-blank line of the textarea), each
 * inheriting the original's type/source/owner/confidence and linked back
 * via split_from_candidate_id. The original is marked Split (terminal, not
 * deleted), linked forward via split_into_candidate_ids.
 */
export async function splitCandidate(projectId: string, interactionId: string, formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");
  const statements = String(formData.get("statements") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (statements.length < 2) {
    throw new Error("Enter at least two statements, one per line, to split into.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: original, error: fetchError } = await supabase
    .from("extraction_candidate")
    .select("*")
    .eq("candidate_id", candidateId)
    .single();
  if (fetchError) throw new Error(`Failed to load candidate: ${fetchError.message}`);
  if (original.status !== "Pending") {
    throw new Error("Only a Pending candidate can be split.");
  }

  const { data: splitRows, error: insertError } = await supabase
    .from("extraction_candidate")
    .insert(
      statements.map((statement) => ({
        project_id: projectId,
        interaction_id: interactionId,
        candidate_type: original.candidate_type,
        statement,
        suggested_owner: original.suggested_owner,
        suggested_due_date: original.suggested_due_date,
        functional_area_hint: original.functional_area_hint,
        confidence_score: original.confidence_score,
        source_utterance_id: original.source_utterance_id,
        status: "Pending",
        split_from_candidate_id: candidateId,
      }))
    )
    .select("candidate_id");
  if (insertError) throw new Error(`Failed to create split candidates: ${insertError.message}`);

  const { error: updateError } = await supabase
    .from("extraction_candidate")
    .update({
      status: "Split",
      split_into_candidate_ids: (splitRows ?? []).map((r) => r.candidate_id),
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("candidate_id", candidateId);
  if (updateError) throw new Error(`Failed to mark original split: ${updateError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "ExtractionCandidate",
    targetObjectId: candidateId,
    newValue: { action: "split", into_statements: statements },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/**
 * §3.2 stage 3: "Case cannot advance while contradictions remain
 * unresolved" — generalised here to no candidate left Pending, since a
 * Pending candidate is either an unresolved contradiction or simply a
 * decision the BA hasn't made yet, and both block advancement per the spec.
 */
export async function confirmInteraction(projectId: string, interactionId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { count, error } = await supabase
    .from("extraction_candidate")
    .select("candidate_id", { count: "exact", head: true })
    .eq("interaction_id", interactionId)
    .eq("status", "Pending");

  if (error) {
    throw new Error(`Failed to check candidates: ${error.message}`);
  }
  if (count && count > 0) {
    throw new Error(`${count} candidate(s) still need a decision before this can advance.`);
  }

  const { error: updateError } = await supabase
    .from("interaction")
    .update({ processing_status: "Confirmed" })
    .eq("interaction_id", interactionId);

  if (updateError) {
    throw new Error(`Failed to confirm interaction: ${updateError.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "Interaction",
    targetObjectId: interactionId,
    newValue: { processing_status: "Confirmed" },
  });

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}
