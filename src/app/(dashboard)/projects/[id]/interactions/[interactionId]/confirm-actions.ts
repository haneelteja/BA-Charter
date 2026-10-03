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

  revalidatePath(`/projects/${projectId}/interactions/${interactionId}`);
}

/** Revert a pre-accepted candidate back to Pending — §3.2: "may be reverted." */
export async function revertCandidate(projectId: string, interactionId: string, formData: FormData) {
  const candidateId = String(formData.get("candidate_id") ?? "");

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("extraction_candidate")
    .update({ status: "Pending", decided_by: null, decided_at: null })
    .eq("candidate_id", candidateId);

  if (error) {
    throw new Error(`Failed to revert candidate: ${error.message}`);
  }

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
