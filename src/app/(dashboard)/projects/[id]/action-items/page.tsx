import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cancelActionItem, completeActionItem, startActionItem, verifyActionItem } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["Open", "InProgress", "Completed", "Verified", "Cancelled"];

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
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Action items</h1>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const group = (items ?? []).filter((i) => i.status === status);
        if (group.length === 0) return null;

        return (
          <section key={status} className="mt-6">
            <h2 className="text-sm font-medium">
              {status} ({group.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-3">
              {group.map((item) => {
                const isOverdue =
                  item.due_date && item.due_date < today && !["Completed", "Verified", "Cancelled"].includes(item.status);

                return (
                  <li
                    key={item.action_item_id}
                    className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{item.title}</p>
                      {isOverdue && (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Owner: {ownerName(item.owner_user_id)}
                      {item.due_date && ` · Due ${item.due_date}`}
                      {item.priority && ` · ${item.priority}`}
                    </p>
                    {item.outcome_note && (
                      <p className="mt-1 text-xs text-neutral-500">Outcome: {item.outcome_note}</p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.status === "Open" && (
                        <form action={startForProject}>
                          <input type="hidden" name="action_item_id" value={item.action_item_id} />
                          <button
                            type="submit"
                            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            Start
                          </button>
                        </form>
                      )}
                      {item.status === "InProgress" && (
                        <form action={completeForProject} className="flex items-center gap-2">
                          <input type="hidden" name="action_item_id" value={item.action_item_id} />
                          <input
                            name="outcome_note"
                            placeholder="Outcome"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <button
                            type="submit"
                            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            Complete
                          </button>
                        </form>
                      )}
                      {item.status === "Completed" && (
                        <form action={verifyForProject}>
                          <input type="hidden" name="action_item_id" value={item.action_item_id} />
                          <button
                            type="submit"
                            className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                          >
                            Verify closure
                          </button>
                        </form>
                      )}
                      {(item.status === "Open" || item.status === "InProgress") && (
                        <form action={cancelForProject}>
                          <input type="hidden" name="action_item_id" value={item.action_item_id} />
                          <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                            Cancel
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!error && (items ?? []).length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No action items yet.</p>
      )}
    </main>
  );
}
