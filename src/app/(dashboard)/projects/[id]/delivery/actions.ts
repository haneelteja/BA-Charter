"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { assignNextPartner } from "@/lib/delivery/assignNextPartner";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

export async function createDeliveryPartner(projectId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const slaHoursRaw = String(formData.get("sla_hours") ?? "").trim();

  if (!name) {
    throw new Error("Partner name is required.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { count } = await supabase
    .from("delivery_partner")
    .select("delivery_partner_id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("delivery_partner").insert({
    project_id: projectId,
    name,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    sla_hours: slaHoursRaw ? Number(slaHoursRaw) : null,
    priority_order: (count ?? 0) + 1,
  });
  if (error) throw new Error(`Failed to create delivery partner: ${error.message}`);

  revalidatePath(`/projects/${projectId}/delivery`);
}

/** Updates just the SLA threshold — null clears it (automatic timeout off, manual decline still always works). */
export async function updateDeliveryPartnerSla(projectId: string, formData: FormData) {
  const partnerId = String(formData.get("delivery_partner_id") ?? "");
  const slaHoursRaw = String(formData.get("sla_hours") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("delivery_partner")
    .update({ sla_hours: slaHoursRaw ? Number(slaHoursRaw) : null })
    .eq("delivery_partner_id", partnerId);
  if (error) throw new Error(`Failed to update SLA: ${error.message}`);

  revalidatePath(`/projects/${projectId}/delivery`);
}

export async function toggleDeliveryPartnerActive(projectId: string, formData: FormData) {
  const partnerId = String(formData.get("delivery_partner_id") ?? "");
  const isActive = formData.get("is_active") === "true";

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("delivery_partner")
    .update({ is_active: !isActive })
    .eq("delivery_partner_id", partnerId);
  if (error) throw new Error(`Failed to update delivery partner: ${error.message}`);

  revalidatePath(`/projects/${projectId}/delivery`);
}

/** Swaps this partner's priority_order with its neighbor in the given direction, renumbering the whole list. */
export async function reorderDeliveryPartner(projectId: string, formData: FormData) {
  const partnerId = String(formData.get("delivery_partner_id") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { data: partners, error } = await supabase
    .from("delivery_partner")
    .select("delivery_partner_id, priority_order")
    .eq("project_id", projectId)
    .order("priority_order", { ascending: true });
  if (error) throw new Error(`Failed to load delivery partners: ${error.message}`);

  const ordered = partners ?? [];
  const index = ordered.findIndex((p) => p.delivery_partner_id === partnerId);
  const swapWith = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) {
    return;
  }

  const a = ordered[index];
  const b = ordered[swapWith];

  const [{ error: errA }, { error: errB }] = await Promise.all([
    supabase.from("delivery_partner").update({ priority_order: b.priority_order }).eq("delivery_partner_id", a.delivery_partner_id),
    supabase.from("delivery_partner").update({ priority_order: a.priority_order }).eq("delivery_partner_id", b.delivery_partner_id),
  ]);
  if (errA || errB) throw new Error(`Failed to reorder delivery partners: ${(errA ?? errB)?.message}`);

  revalidatePath(`/projects/${projectId}/delivery`);
}

export async function deleteDeliveryPartner(projectId: string, formData: FormData) {
  const partnerId = String(formData.get("delivery_partner_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { count } = await supabase
    .from("delivery_attempt")
    .select("delivery_attempt_id", { count: "exact", head: true })
    .eq("delivery_partner_id", partnerId);

  if ((count ?? 0) > 0) {
    throw new Error("This partner has delivery history — deactivate it instead of deleting.");
  }

  const { error } = await supabase.from("delivery_partner").delete().eq("delivery_partner_id", partnerId);
  if (error) throw new Error(`Failed to delete delivery partner: ${error.message}`);

  revalidatePath(`/projects/${projectId}/delivery`);
}

/** Creates a delivery and immediately assigns it to the first active partner in priority order. */
export async function createDelivery(projectId: string, formData: FormData) {
  const recipientName = String(formData.get("recipient_name") ?? "").trim();
  const deliveryAddress = String(formData.get("delivery_address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const costRaw = String(formData.get("cost") ?? "").trim();

  if (!recipientName) {
    throw new Error("Recipient name is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: created, error } = await supabase
    .from("delivery")
    .insert({
      project_id: projectId,
      recipient_name: recipientName,
      delivery_address: deliveryAddress || null,
      notes: notes || null,
      cost: costRaw ? Number(costRaw) : null,
    })
    .select("delivery_id")
    .single();
  if (error) throw new Error(`Failed to create delivery: ${error.message}`);

  await assignNextPartner(supabase, projectId, created.delivery_id, 0);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "Delivery",
    targetObjectId: created.delivery_id,
    newValue: { recipient_name: recipientName },
  });

  revalidatePath(`/projects/${projectId}/delivery`);
}

async function requireCurrentAttempt(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  deliveryId: string
) {
  const { data: delivery, error } = await supabase
    .from("delivery")
    .select("delivery_id, project_id, status, current_partner_id, attempt_sequence")
    .eq("delivery_id", deliveryId)
    .single();
  if (error) throw new Error(`Failed to load delivery: ${error.message}`);
  if (!delivery.current_partner_id) {
    throw new Error("This delivery has no partner currently assigned.");
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("delivery_attempt")
    .select("delivery_attempt_id")
    .eq("delivery_id", deliveryId)
    .eq("sequence_no", delivery.attempt_sequence)
    .single();
  if (attemptError) throw new Error(`Failed to load delivery attempt: ${attemptError.message}`);

  return { delivery, attemptId: attempt.delivery_attempt_id as string };
}

export async function markDeliveryInTransit(projectId: string, formData: FormData) {
  const deliveryId = String(formData.get("delivery_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { delivery, attemptId } = await requireCurrentAttempt(supabase, deliveryId);
  if (delivery.status !== "Assigned") {
    throw new Error(`Cannot mark in transit from status ${delivery.status}.`);
  }

  const nowIso = new Date().toISOString();
  const [{ error: deliveryError }, { error: attemptError }] = await Promise.all([
    supabase.from("delivery").update({ status: "InTransit", in_transit_at: nowIso }).eq("delivery_id", deliveryId),
    supabase.from("delivery_attempt").update({ status: "InTransit" }).eq("delivery_attempt_id", attemptId),
  ]);
  if (deliveryError || attemptError) {
    throw new Error(`Failed to mark delivery in transit: ${(deliveryError ?? attemptError)?.message}`);
  }

  revalidatePath(`/projects/${projectId}/delivery`);
}

export async function markDeliveryDelivered(projectId: string, formData: FormData) {
  const deliveryId = String(formData.get("delivery_id") ?? "");
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { delivery, attemptId } = await requireCurrentAttempt(supabase, deliveryId);
  if (delivery.status !== "Assigned" && delivery.status !== "InTransit") {
    throw new Error(`Cannot mark delivered from status ${delivery.status}.`);
  }

  const nowIso = new Date().toISOString();
  const [{ error: deliveryError }, { error: attemptError }] = await Promise.all([
    supabase.from("delivery").update({ status: "Delivered", delivered_at: nowIso }).eq("delivery_id", deliveryId),
    supabase.from("delivery_attempt").update({ status: "Delivered", resolved_at: nowIso }).eq("delivery_attempt_id", attemptId),
  ]);
  if (deliveryError || attemptError) {
    throw new Error(`Failed to mark delivery delivered: ${(deliveryError ?? attemptError)?.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "Delivery",
    targetObjectId: deliveryId,
    newValue: { status: "Delivered" },
  });

  revalidatePath(`/projects/${projectId}/delivery`);
}

/** Current partner declined/failed this delivery — falls back to the next partner in priority order, or Failed if none remain. */
export async function declineCurrentPartner(projectId: string, formData: FormData) {
  const deliveryId = String(formData.get("delivery_id") ?? "");
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { delivery, attemptId } = await requireCurrentAttempt(supabase, deliveryId);
  if (delivery.status !== "Assigned" && delivery.status !== "InTransit") {
    throw new Error(`Cannot decline from status ${delivery.status}.`);
  }

  const nowIso = new Date().toISOString();
  const { error: attemptError } = await supabase
    .from("delivery_attempt")
    .update({ status: "Declined", resolved_at: nowIso })
    .eq("delivery_attempt_id", attemptId);
  if (attemptError) throw new Error(`Failed to decline delivery attempt: ${attemptError.message}`);

  await assignNextPartner(supabase, projectId, deliveryId, delivery.attempt_sequence);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "Delivery",
    targetObjectId: deliveryId,
    newValue: { declined_attempt: attemptId },
  });

  revalidatePath(`/projects/${projectId}/delivery`);
}
