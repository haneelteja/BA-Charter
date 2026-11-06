import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared by the "Partner declined / failed" server action and the
 * sweep_delivery_timeout job — both land here whenever a delivery needs to
 * move to the next active partner by priority_order, or terminate as
 * Failed once none remain. Takes whichever client the caller already has
 * (request-scoped for the action, service-role for the sweep) since the
 * assignment logic itself doesn't care which.
 */
export async function assignNextPartner(
  supabase: SupabaseClient,
  projectId: string,
  deliveryId: string,
  afterSequence: number
): Promise<void> {
  const { data: partners, error } = await supabase
    .from("delivery_partner")
    .select("delivery_partner_id")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("priority_order", { ascending: true });
  if (error) throw new Error(`Failed to load delivery partners: ${error.message}`);

  const next = (partners ?? [])[afterSequence];
  const nowIso = new Date().toISOString();

  if (!next) {
    const { error: failError } = await supabase
      .from("delivery")
      .update({ status: "Failed", current_partner_id: null, failed_at: nowIso })
      .eq("delivery_id", deliveryId);
    if (failError) throw new Error(`Failed to mark delivery failed: ${failError.message}`);
    return;
  }

  const sequenceNo = afterSequence + 1;
  const { error: attemptError } = await supabase.from("delivery_attempt").insert({
    delivery_id: deliveryId,
    delivery_partner_id: next.delivery_partner_id,
    sequence_no: sequenceNo,
    status: "Assigned",
    assigned_at: nowIso,
  });
  if (attemptError) throw new Error(`Failed to create delivery attempt: ${attemptError.message}`);

  const { error: updateError } = await supabase
    .from("delivery")
    .update({
      status: "Assigned",
      current_partner_id: next.delivery_partner_id,
      attempt_sequence: sequenceNo,
      assigned_at: nowIso,
    })
    .eq("delivery_id", deliveryId);
  if (updateError) throw new Error(`Failed to update delivery: ${updateError.message}`);
}
