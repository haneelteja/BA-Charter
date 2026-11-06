import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";

const SLA_MINUTES = 15;

/**
 * §3.2 service level: "minutes of meeting drafted within fifteen minutes
 * of source upload." No case-level timer existed before this — the job
 * queue only does FIFO + retry, nothing about deadlines (see BACKLOG.md
 * EPIC 5). There's no notification/inbox system (same gap noted for the
 * action item/clarification sweeps), so "alert" means an audit_event plus
 * a visible badge on the interaction, same pattern as those two.
 * sla_breached_at makes this idempotent; recurrence is Vercel Cron.
 */
export async function handleSweepMeetingIngestionSla(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - SLA_MINUTES * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from("interaction")
    .select("interaction_id, project_id, title, ingested_at")
    .is("sla_breached_at", null)
    .eq("is_purged", false)
    .lt("ingested_at", cutoff);

  if (error) {
    throw new Error(`Failed to query interactions for SLA sweep: ${error.message}`);
  }
  if (!candidates || candidates.length === 0) return;

  const { data: withMinutes, error: minutesError } = await supabase
    .from("minutes_document")
    .select("interaction_id")
    .in(
      "interaction_id",
      candidates.map((c) => c.interaction_id)
    );
  if (minutesError) {
    throw new Error(`Failed to check for existing minutes: ${minutesError.message}`);
  }
  const interactionIdsWithMinutes = new Set((withMinutes ?? []).map((m) => m.interaction_id));

  for (const interaction of candidates) {
    if (interactionIdsWithMinutes.has(interaction.interaction_id)) continue;

    const { error: updateError } = await supabase
      .from("interaction")
      .update({ sla_breached_at: new Date().toISOString() })
      .eq("interaction_id", interaction.interaction_id);
    if (updateError) {
      throw new Error(`Failed to mark interaction SLA breached: ${updateError.message}`);
    }

    await logAuditEvent(supabase, {
      projectId: interaction.project_id,
      actorUserId: null,
      eventType: "Escalated",
      targetObjectType: "Interaction",
      targetObjectId: interaction.interaction_id,
      newValue: { title: interaction.title, reason: "sla_breach", sla_minutes: SLA_MINUTES },
    });
  }
}
