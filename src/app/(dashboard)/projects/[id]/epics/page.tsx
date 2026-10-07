import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createEpic } from "./actions";
import { BackLink, Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral"> = {
  Draft: "neutral",
  InReview: "amber",
  Approved: "indigo",
  Published: "green",
};

export default async function EpicsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: epics, error } = await supabase
    .from("epic")
    .select("epic_id, title, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const createForProject = createEpic.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Epics" />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          + New epic
        </summary>
        <Card className="mt-4">
          <form action={createForProject} className="flex flex-col gap-3">
            <Field label="Title" htmlFor="epic-title">
              <Input id="epic-title" name="title" placeholder="Title" required />
            </Field>
            <Field label="Business objective" htmlFor="epic-objective">
              <Textarea id="epic-objective" name="business_objective" placeholder="Business objective" rows={2} />
            </Field>
            <Field label="In scope" htmlFor="epic-in-scope">
              <Textarea id="epic-in-scope" name="in_scope" placeholder="In scope" rows={2} />
            </Field>
            <Field label="Out of scope" htmlFor="epic-out-scope">
              <Textarea id="epic-out-scope" name="out_of_scope" placeholder="Out of scope" rows={2} />
            </Field>
            <Button type="submit" variant="primary" className="w-fit">
              Create
            </Button>
          </form>
        </Card>
      </details>

      <ul className="mt-6 flex flex-col gap-3">
        {epics?.map((e) => (
          <li key={e.epic_id}>
            <Link href={`/projects/${projectId}/epics/${e.epic_id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{e.title}</p>
                  <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {!error && (epics ?? []).length === 0 && <Card className="mt-6 text-sm text-muted">No epics yet.</Card>}
    </main>
  );
}
