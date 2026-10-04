import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";

/**
 * §3.3: "Escalates to the Lead Business Analyst when overdue." There's no
 * notification/inbox system yet, so escalation means an audit_event (type
 * Escalated) plus the "Overdue" badge the worklist page already computes
 * from due_date — a Lead BA sees it there. escalated_at makes this
 * idempotent: once flagged, a later sweep tick won't re-escalate the same
 * item. Recurrence is owned by Vercel Cron (src/app/api/cron/sweeps/route.ts)
 * rather than self-rescheduling through the job queue — see
 * src/lib/jobs/enqueue.ts for why there's no standing worker to chain against.
 */
export async function handleSweepActionItemOverdue(): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdue, error } = await supabase
    .from("action_item")
    .select("action_item_id, project_id, title")
    .lt("due_date", today)
    .is("escalated_at", null)
    .in("status", ["Open", "InProgress"]);

  if (error) {
    throw new Error(`Failed to query overdue action items: ${error.message}`);
  }

  for (const item of overdue ?? []) {
    const { error: updateError } = await supabase
      .from("action_item")
      .update({ escalated_at: new Date().toISOString() })
      .eq("action_item_id", item.action_item_id);

    if (updateError) {
      throw new Error(`Failed to mark action item escalated: ${updateError.message}`);
    }

    await logAuditEvent(supabase, {
      projectId: item.project_id,
      actorUserId: null,
      eventType: "Escalated",
      targetObjectType: "ActionItem",
      targetObjectId: item.action_item_id,
      newValue: { title: item.title, reason: "overdue" },
    });
  }
}
