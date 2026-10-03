"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { getAgileStudioClient } from "@/lib/agileStudio/client";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

/** §3.5 stage 1. */
export async function createEpic(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const businessObjective = String(formData.get("business_objective") ?? "").trim();
  const inScope = String(formData.get("in_scope") ?? "").trim();
  const outOfScope = String(formData.get("out_of_scope") ?? "").trim();

  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: epic, error } = await supabase
    .from("epic")
    .insert({
      project_id: projectId,
      title,
      business_objective: businessObjective || null,
      in_scope: inScope || null,
      out_of_scope: outOfScope || null,
      status: "Draft",
      created_by: user.id,
    })
    .select("epic_id")
    .single();

  if (error) throw new Error(`Failed to create epic: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "Epic",
    targetObjectId: epic.epic_id,
    newValue: { title },
  });

  redirect(`/projects/${projectId}/epics/${epic.epic_id}`);
}

export async function updateEpic(projectId: string, epicId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const businessObjective = String(formData.get("business_objective") ?? "").trim();
  const inScope = String(formData.get("in_scope") ?? "").trim();
  const outOfScope = String(formData.get("out_of_scope") ?? "").trim();

  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("epic")
    .update({
      title,
      business_objective: businessObjective || null,
      in_scope: inScope || null,
      out_of_scope: outOfScope || null,
    })
    .eq("epic_id", epicId)
    .eq("status", "Draft");

  if (error) throw new Error(`Failed to update epic: ${error.message}`);

  revalidatePath(`/projects/${projectId}/epics/${epicId}`);
}

/** §3.5 stage 2: "attach source decisions and charter nodes." */
export async function linkEpic(projectId: string, epicId: string, formData: FormData) {
  const targetType = String(formData.get("target_type") ?? "");
  const targetId = String(formData.get("target_id") ?? "");

  if ((targetType !== "Decision" && targetType !== "KnowledgeNode") || !targetId) {
    throw new Error("Invalid link target.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error } = await supabase.from("trace_link").insert({
    project_id: projectId,
    from_object_type: "Epic",
    from_object_id: epicId,
    to_object_type: targetType,
    to_object_id: targetId,
    link_type: "DerivedFrom",
  });
  if (error) throw new Error(`Failed to link: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "Epic",
    targetObjectId: epicId,
    newValue: { linked_to: targetType, target_id: targetId },
  });

  revalidatePath(`/projects/${projectId}/epics/${epicId}`);
}

export async function unlinkEpic(projectId: string, epicId: string, formData: FormData) {
  const traceLinkId = String(formData.get("trace_link_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("trace_link").delete().eq("trace_link_id", traceLinkId);
  if (error) throw new Error(`Failed to unlink: ${error.message}`);

  revalidatePath(`/projects/${projectId}/epics/${epicId}`);
}

/** §3.5 stage 2 -> 3 transition: at least one link, same completeness spirit as other Review-gated case types. */
export async function submitEpicForReview(projectId: string, epicId: string) {
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { count } = await supabase
    .from("trace_link")
    .select("trace_link_id", { count: "exact", head: true })
    .eq("from_object_type", "Epic")
    .eq("from_object_id", epicId);

  if (!count) {
    throw new Error("Link at least one decision or charter entry before submitting for review.");
  }

  const { error } = await supabase
    .from("epic")
    .update({ status: "InReview" })
    .eq("epic_id", epicId)
    .eq("status", "Draft");
  if (error) throw new Error(`Failed to submit for review: ${error.message}`);

  revalidatePath(`/projects/${projectId}/epics/${epicId}`);
}

/** §3.5 stage 3 — Lead BA only. */
export async function reviewEpic(projectId: string, epicId: string, formData: FormData) {
  const outcome = String(formData.get("outcome") ?? "");
  const comments = String(formData.get("comments") ?? "").trim();

  if (outcome !== "Approved" && outcome !== "ReturnedForRework") {
    throw new Error("Invalid review outcome.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const role = await getProjectRole(supabase, projectId, user.id);
  if (!isLead(role)) {
    throw new Error("Only a Lead Business Analyst can review an epic.");
  }

  const { error: reviewError } = await supabase.from("review").insert({
    project_id: projectId,
    target_object_type: "Epic",
    target_object_id: epicId,
    reviewer_user_id: user.id,
    outcome,
    comments: comments || null,
    reviewed_at: new Date().toISOString(),
  });
  if (reviewError) throw new Error(`Failed to record review: ${reviewError.message}`);

  const { error: updateError } = await supabase
    .from("epic")
    .update({ status: outcome === "Approved" ? "Approved" : "Draft" })
    .eq("epic_id", epicId);
  if (updateError) throw new Error(`Failed to update epic status: ${updateError.message}`);

  revalidatePath(`/projects/${projectId}/epics/${epicId}`);
}

/** §3.5 stage 4. */
export async function publishEpic(projectId: string, epicId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: epic, error: fetchError } = await supabase
    .from("epic")
    .select("title, status")
    .eq("epic_id", epicId)
    .single();
  if (fetchError) throw new Error(`Failed to load epic: ${fetchError.message}`);
  if (epic.status !== "Approved") {
    throw new Error(`Cannot publish an epic in status ${epic.status}.`);
  }

  const { ref } = await getAgileStudioClient().publishEpic({ epicId, title: epic.title });

  const { error: updateError } = await supabase
    .from("epic")
    .update({ status: "Published", agile_studio_ref: ref })
    .eq("epic_id", epicId);
  if (updateError) throw new Error(`Failed to update epic: ${updateError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Published",
    targetObjectType: "Epic",
    targetObjectId: epicId,
    newValue: { status: "Published", agile_studio_ref: ref },
  });

  revalidatePath(`/projects/${projectId}/epics/${epicId}`);
}
