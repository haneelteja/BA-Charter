import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";
import { assignNextPartner } from "@/lib/delivery/assignNextPartner";

/**
 * EPIC 18 follow-up: a partner with sla_hours set that hasn't resolved its
 * current attempt in time is treated as a timeout — same outcome as a
 * manual "Partner declined / failed" (fall back to the next active
 * partner, or Failed if none remain). A partner with sla_hours null is
 * untouched here; manual decline is still always available for it.
 *
 * No separate idempotency flag needed (unlike escalated_at on action_item):
 * handling a timeout changes assigned_at to the new attempt's timestamp,
 * so the same overdue delivery won't match this sweep's own WHERE clause
 * again until its new attempt's own SLA elapses.
 */
export async function handleSweepDeliveryTimeout(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: candidates, error } = await supabase
    .from("delivery")
    .select("delivery_id, project_id, attempt_sequence, assigned_at, current_partner_id")
    .in("status", ["Assigned", "InTransit"])
    .not("current_partner_id", "is", null);

  if (error) {
    throw new Error(`Failed to query deliveries for SLA timeout: ${error.message}`);
  }

  const partnerIds = Array.from(new Set((candidates ?? []).map((d) => d.current_partner_id as string)));
  const { data: partners, error: partnersError } = partnerIds.length
    ? await supabase.from("delivery_partner").select("delivery_partner_id, sla_hours").in("delivery_partner_id", partnerIds)
    : { data: [], error: null };
  if (partnersError) {
    throw new Error(`Failed to load partner SLAs: ${partnersError.message}`);
  }
  const slaByPartnerId = new Map((partners ?? []).map((p) => [p.delivery_partner_id, p.sla_hours]));

  const now = Date.now();

  for (const row of candidates ?? []) {
    const slaHours = slaByPartnerId.get(row.current_partner_id as string);
    if (slaHours == null || !row.assigned_at) continue;

    const dueAt = new Date(row.assigned_at).getTime() + Number(slaHours) * 60 * 60 * 1000;
    if (dueAt > now) continue;

    const { data: attempt, error: attemptError } = await supabase
      .from("delivery_attempt")
      .select("delivery_attempt_id")
      .eq("delivery_id", row.delivery_id)
      .eq("sequence_no", row.attempt_sequence)
      .single();
    if (attemptError) {
      console.error(`[jobs] sweep_delivery_timeout: failed to load attempt for delivery ${row.delivery_id}:`, attemptError.message);
      continue;
    }

    const { error: declineError } = await supabase
      .from("delivery_attempt")
      .update({ status: "Declined", resolved_at: new Date().toISOString() })
      .eq("delivery_attempt_id", attempt.delivery_attempt_id);
    if (declineError) {
      console.error(`[jobs] sweep_delivery_timeout: failed to decline attempt ${attempt.delivery_attempt_id}:`, declineError.message);
      continue;
    }

    await assignNextPartner(supabase, row.project_id, row.delivery_id, row.attempt_sequence);

    await logAuditEvent(supabase, {
      projectId: row.project_id,
      actorUserId: null,
      eventType: "Escalated",
      targetObjectType: "Delivery",
      targetObjectId: row.delivery_id,
      newValue: { reason: "sla_timeout", partner_id: row.current_partner_id, sla_hours: slaHours },
    });
  }
}
