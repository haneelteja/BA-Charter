"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { getProjectRole, isLead } from "@/lib/projects/role";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

async function requireOwnerOrLead(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectId: string,
  actionItemId: string,
  userId: string
) {
  const { data: item, error } = await supabase
    .from("action_item")
    .select("owner_user_id, raised_by, status")
    .eq("action_item_id", actionItemId)
    .single();

  if (error) {
    throw new Error(`Failed to load action item: ${error.message}`);
  }

  const role = await getProjectRole(supabase, projectId, userId);
  if (item.owner_user_id !== userId && item.raised_by !== userId && !isLead(role)) {
    throw new Error("Only the owner, the raiser, or a Lead Business Analyst can change this action item.");
  }

  return item;
}

/** §3.3 stage 2 — owner starts work. */
export async function startActionItem(projectId: string, formData: FormData) {
  const actionItemId = String(formData.get("action_item_id") ?? "");
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  const item = await requireOwnerOrLead(supabase, projectId, actionItemId, user.id);

  if (item.status !== "Open") {
    throw new Error(`Cannot start an item in status ${item.status}.`);
  }

  const { error } = await supabase
    .from("action_item")
    .update({ status: "InProgress" })
    .eq("action_item_id", actionItemId);
  if (error) throw new Error(`Failed to start action item: ${error.message}`);

  revalidatePath(`/projects/${projectId}/action-items`);
}

/** §3.3 stage 3 — owner records outcome. */
export async function completeActionItem(projectId: string, formData: FormData) {
  const actionItemId = String(formData.get("action_item_id") ?? "");
  const outcomeNote = String(formData.get("outcome_note") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  const item = await requireOwnerOrLead(supabase, projectId, actionItemId, user.id);

  if (item.status !== "InProgress") {
    throw new Error(`Cannot complete an item in status ${item.status}.`);
  }

  const { error } = await supabase
    .from("action_item")
    .update({ status: "Completed", outcome_note: outcomeNote || null, completed_at: new Date().toISOString() })
    .eq("action_item_id", actionItemId);
  if (error) throw new Error(`Failed to complete action item: ${error.message}`);

  revalidatePath(`/projects/${projectId}/action-items`);
}

/** §3.3 stage 4 — only the raising BA (or a Lead) confirms closure. */
export async function verifyActionItem(projectId: string, formData: FormData) {
  const actionItemId = String(formData.get("action_item_id") ?? "");

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: item, error: fetchError } = await supabase
    .from("action_item")
    .select("raised_by, status")
    .eq("action_item_id", actionItemId)
    .single();
  if (fetchError) throw new Error(`Failed to load action item: ${fetchError.message}`);

  const role = await getProjectRole(supabase, projectId, user.id);
  if (item.raised_by !== user.id && !isLead(role)) {
    throw new Error("Only the raising Business Analyst or a Lead BA can verify closure.");
  }
  if (item.status !== "Completed") {
    throw new Error(`Cannot verify an item in status ${item.status}.`);
  }

  const { error } = await supabase
    .from("action_item")
    .update({ status: "Verified" })
    .eq("action_item_id", actionItemId);
  if (error) throw new Error(`Failed to verify action item: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Confirmed",
    targetObjectType: "ActionItem",
    targetObjectId: actionItemId,
    newValue: { status: "Verified" },
  });

  revalidatePath(`/projects/${projectId}/action-items`);
}

export async function cancelActionItem(projectId: string, formData: FormData) {
  const actionItemId = String(formData.get("action_item_id") ?? "");

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);
  const item = await requireOwnerOrLead(supabase, projectId, actionItemId, user.id);

  if (item.status === "Verified" || item.status === "Cancelled") {
    throw new Error(`Cannot cancel an item in status ${item.status}.`);
  }

  const { error } = await supabase
    .from("action_item")
    .update({ status: "Cancelled" })
    .eq("action_item_id", actionItemId);
  if (error) throw new Error(`Failed to cancel action item: ${error.message}`);

  revalidatePath(`/projects/${projectId}/action-items`);
}
