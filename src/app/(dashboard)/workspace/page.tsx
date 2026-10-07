import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * EPIC 13 — every query below is a plain select scoped by RLS
 * (is_project_member, 0004_rls_policies.sql) plus an additional filter to
 * "mine" where the backlog says "my" (owner_user_id / chasing_user_id).
 * Nothing here adds a titles-visible-everywhere exception: every list in
 * this epic is explicitly "across all member projects", so the standard
 * membership gate already satisfies §4's visibility rule — there's no case
 * in this backlog where a title needs to be shown outside membership.
 */
export default async function WorkspacePage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect("/sign-in");
  }
  const userId = auth.user.id;

  const { data: actionItems } = await supabase
    .from("action_item")
    .select("action_item_id, project_id, title, due_date, priority, status, project:project_id(project_name)")
    .eq("owner_user_id", userId)
    .in("status", ["Open", "InProgress"])
    .order("due_date", { ascending: true, nullsFirst: false });

  const { data: clarifications } = await supabase
    .from("clarification")
    .select("clarification_id, project_id, question, raised_at, is_blocking, project:project_id(project_name)")
    .eq("chasing_user_id", userId)
    .not("status", "in", "(Confirmed,Withdrawn)")
    .order("raised_at", { ascending: true });

  const { data: candidates } = await supabase
    .from("extraction_candidate")
    .select(
      "candidate_id, project_id, interaction_id, candidate_type, statement, confidence_score, project:project_id(project_name), interaction:interaction_id(title)"
    )
    .eq("status", "Pending")
    .order("created_at", { ascending: false });

  const { data: storiesInReview } = await supabase
    .from("user_story")
    .select("user_story_id, project_id, title, created_at, project:project_id(project_name)")
    .eq("status", "InReview")
    .order("created_at", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
        <span aria-hidden="true">←</span> Your projects
      </Link>
      <PageHeader title="Workspace" subtitle="Aggregated across every project you're a member of." />

      <section className="mt-8">
        <h2 className="text-sm font-semibold">
          My action items {actionItems && actionItems.length > 0 && `(${actionItems.length})`}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(actionItems ?? []).map((item) => {
            const isOverdue = item.due_date && item.due_date < today;
            return (
              <li key={item.action_item_id}>
                <Link href={`/projects/${item.project_id}/action-items`}>
                  <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{item.title}</p>
                      {isOverdue && <Badge tone="red">Overdue</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {(item.project as unknown as { project_name: string } | null)?.project_name}
                      {item.due_date && ` · Due ${item.due_date}`}
                      {item.priority && ` · ${item.priority}`}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
        {(actionItems ?? []).length === 0 && <p className="mt-2 text-xs text-muted">Nothing open.</p>}
      </section>

      <section className="mt-8 border-t border-surface-border pt-6">
        <h2 className="text-sm font-semibold">
          My clarifications {clarifications && clarifications.length > 0 && `(${clarifications.length})`}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(clarifications ?? []).map((c) => (
            <li key={c.clarification_id}>
              <Link href={`/projects/${c.project_id}/clarifications`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{c.question}</p>
                    {c.is_blocking && <Badge tone="amber">Blocking</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {(c.project as unknown as { project_name: string } | null)?.project_name} · {daysSince(c.raised_at)}d old
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {(clarifications ?? []).length === 0 && <p className="mt-2 text-xs text-muted">Nothing open.</p>}
      </section>

      <section className="mt-8 border-t border-surface-border pt-6">
        <h2 className="text-sm font-semibold">
          Awaiting my confirmation {candidates && candidates.length > 0 && `(${candidates.length})`}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(candidates ?? []).map((c) => (
            <li key={c.candidate_id}>
              <Link href={`/projects/${c.project_id}/interactions/${c.interaction_id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                  <p className="font-medium">{c.statement}</p>
                  <p className="mt-1 text-xs text-muted">
                    {(c.project as unknown as { project_name: string } | null)?.project_name} · {c.candidate_type} ·{" "}
                    {Math.round(c.confidence_score * 100)}% confidence ·{" "}
                    {(c.interaction as unknown as { title: string } | null)?.title}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {(candidates ?? []).length === 0 && <p className="mt-2 text-xs text-muted">Nothing pending.</p>}
      </section>

      <section className="mt-8 border-t border-surface-border pt-6">
        <h2 className="text-sm font-semibold">
          Awaiting my review {storiesInReview && storiesInReview.length > 0 && `(${storiesInReview.length})`}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(storiesInReview ?? []).map((s) => (
            <li key={s.user_story_id}>
              <Link href={`/projects/${s.project_id}/stories/${s.user_story_id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {(s.project as unknown as { project_name: string } | null)?.project_name}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        {(storiesInReview ?? []).length === 0 && <p className="mt-2 text-xs text-muted">Nothing to review.</p>}
      </section>

      <div className="mt-8 border-t border-surface-border pt-6">
        <Link
          href="/workspace/call-prep"
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40"
        >
          Call preparation →
        </Link>
      </div>
    </main>
  );
}
