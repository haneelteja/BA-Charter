import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cancelActionItem, completeActionItem, startActionItem, verifyActionItem } from "./actions";
import { BackLink, Badge, Button, Card, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["Open", "InProgress", "Completed", "Verified", "Cancelled"];
const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral"> = {
  Open: "indigo",
  InProgress: "amber",
  Completed: "green",
  Verified: "green",
  Cancelled: "neutral",
};

export default async function ActionItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: items, error } = await supabase
    .from("action_item")
    .select("*")
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false });

  const ownerIds = Array.from(new Set((items ?? []).map((i) => i.owner_user_id).filter(Boolean)));
  const { data: owners } = ownerIds.length
    ? await supabase.from("app_user").select("user_id, full_name").in("user_id", ownerIds as string[])
    : { data: [] };
  const ownerName = (id: string | null) => (owners ?? []).find((o) => o.user_id === id)?.full_name ?? "Unassigned";

  const startForProject = startActionItem.bind(null, projectId);
  const completeForProject = completeActionItem.bind(null, projectId);
  const verifyForProject = verifyActionItem.bind(null, projectId);
  const cancelForProject = cancelActionItem.bind(null, projectId);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Action items" />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const group = (items ?? []).filter((i) => i.status === status);
        if (group.length === 0) return null;

        return (
          <section key={status} className="mt-8">
            <h2 className="text-sm font-semibold">
              {status} ({group.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {group.map((item) => {
                const isOverdue =
                  item.due_date && item.due_date < today && !["Completed", "Verified", "Cancelled"].includes(item.status);

                return (
                  <li key={item.action_item_id}>
                    <Card>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{item.title}</p>
                        <div className="flex shrink-0 gap-1.5">
                          <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                          {isOverdue && <Badge tone="red">Overdue</Badge>}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Owner: {ownerName(item.owner_user_id)}
                        {item.due_date && ` · Due ${item.due_date}`}
                        {item.priority && ` · ${item.priority}`}
                      </p>
                      {item.outcome_note && (
                        <p className="mt-1 text-xs text-muted">Outcome: {item.outcome_note}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.status === "Open" && (
                          <form action={startForProject}>
                            <input type="hidden" name="action_item_id" value={item.action_item_id} />
                            <Button type="submit" size="sm">
                              Start
                            </Button>
                          </form>
                        )}
                        {item.status === "InProgress" && (
                          <form action={completeForProject} className="flex items-center gap-2">
                            <input type="hidden" name="action_item_id" value={item.action_item_id} />
                            <Input name="outcome_note" placeholder="Outcome" className="h-8 py-1 text-xs" />
                            <Button type="submit" size="sm">
                              Complete
                            </Button>
                          </form>
                        )}
                        {item.status === "Completed" && (
                          <form action={verifyForProject}>
                            <input type="hidden" name="action_item_id" value={item.action_item_id} />
                            <Button type="submit" variant="primary" size="sm">
                              Verify closure
                            </Button>
                          </form>
                        )}
                        {(item.status === "Open" || item.status === "InProgress") && (
                          <form action={cancelForProject}>
                            <input type="hidden" name="action_item_id" value={item.action_item_id} />
                            <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                              Cancel
                            </button>
                          </form>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!error && (items ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No action items yet.</Card>
      )}
    </main>
  );
}
