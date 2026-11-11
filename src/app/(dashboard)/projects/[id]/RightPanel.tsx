import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";

const ACTION_STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral"> = {
  Open: "indigo",
  InProgress: "amber",
};

const EVENT_VERB: Record<string, string> = {
  Confirmed: "confirmed",
  Approved: "approved",
  Published: "published",
  ModelUpdated: "updated",
  ConflictResolved: "resolved a conflict on",
  Created: "created",
  Updated: "updated",
  Deleted: "deleted",
  StatusChanged: "changed the status of",
  Escalated: "escalated",
};

const OBJECT_LABEL: Record<string, string> = {
  Epic: "an epic",
  UserStory: "a user story",
  ActionItem: "an action item",
  Clarification: "a clarification",
  ChangeRequest: "a change request",
  Guardrail: "a guardrail rule",
  Decision: "a decision",
  Interaction: "an interaction",
  MinutesDocument: "meeting minutes",
  Document: "a document",
  FlowDiagram: "a flow diagram",
};

function describeEvent(eventType: string, targetObjectType: string | null): string {
  const verb = EVENT_VERB[eventType] ?? eventType.toLowerCase();
  const object = targetObjectType ? (OBJECT_LABEL[targetObjectType] ?? "an item") : "an item";
  return `${verb} ${object}`;
}

export async function RightPanel({ projectId }: { projectId: string }) {
  const supabase = await getSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: actionItems } = await supabase
    .from("action_item")
    .select("action_item_id, title, due_date, status")
    .eq("project_id", projectId)
    .in("status", ["Open", "InProgress"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(6);

  const { data: events } = await supabase
    .from("audit_event")
    .select("audit_event_id, actor_user_id, event_type, target_object_type, occurred_at")
    .eq("project_id", projectId)
    .order("occurred_at", { ascending: false })
    .limit(10);

  const actorIds = Array.from(new Set((events ?? []).map((e) => e.actor_user_id).filter(Boolean)));
  const { data: actors } = actorIds.length
    ? await supabase.from("app_user").select("user_id, full_name").in("user_id", actorIds as string[])
    : { data: [] };
  const actorName = (id: string | null) => (actors ?? []).find((a) => a.user_id === id)?.full_name ?? "System";

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Action items</h2>
          <Link href={`/projects/${projectId}/action-items`} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            View all
          </Link>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {actionItems?.map((item) => {
            const isOverdue = item.due_date && item.due_date < today;
            return (
              <li key={item.action_item_id}>
                <Card className="py-2.5 text-xs">
                  <p className="font-medium text-sm">{item.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={ACTION_STATUS_TONE[item.status] ?? "neutral"}>{item.status}</Badge>
                    {isOverdue && <Badge tone="red">Overdue</Badge>}
                    {item.due_date && <span className="text-muted">Due {item.due_date}</span>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        {(actionItems ?? []).length === 0 && <p className="mt-3 text-xs text-muted">No open action items.</p>}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {events?.map((e) => (
            <li key={e.audit_event_id} className="text-xs">
              <p>
                <span className="font-medium">{actorName(e.actor_user_id)}</span>{" "}
                {describeEvent(e.event_type, e.target_object_type)}
              </p>
              <p className="text-muted">{new Date(e.occurred_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
        {(events ?? []).length === 0 && <p className="mt-3 text-xs text-muted">No activity yet.</p>}
      </section>
    </div>
  );
}
