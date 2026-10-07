import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createUserStory } from "./actions";
import { BackLink, Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral" | "red"> = {
  Draft: "neutral",
  GuardrailCheck: "amber",
  InReview: "amber",
  ReturnedForRework: "red",
  Approved: "indigo",
  Published: "green",
  Deferred: "neutral",
};

export default async function StoriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: stories, error } = await supabase
    .from("user_story")
    .select("user_story_id, title, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const { data: epics } = await supabase
    .from("epic")
    .select("epic_id, title")
    .eq("project_id", projectId);

  const createForProject = createUserStory.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="User stories" />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          + New story
        </summary>
        <Card className="mt-4">
          <form action={createForProject} className="flex flex-col gap-3">
            <Field label="Parent epic" htmlFor="epic_id">
              <Select id="epic_id" name="epic_id">
                <option value="">(no parent epic)</option>
                {epics?.map((e) => (
                  <option key={e.epic_id} value={e.epic_id}>
                    {e.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="story-title">
              <Input id="story-title" name="title" placeholder="Title" required />
            </Field>
            <Field label="Actor" htmlFor="actor">
              <Input id="actor" name="actor" placeholder="Actor" />
            </Field>
            <Field label="Goal" htmlFor="goal">
              <Input id="goal" name="goal" placeholder="Goal" />
            </Field>
            <Field label="Business value" htmlFor="business_value">
              <Input id="business_value" name="business_value" placeholder="Business value" />
            </Field>
            <Field label="Starting point" htmlFor="starting_point">
              <Input id="starting_point" name="starting_point" placeholder="Starting point" />
            </Field>
            <Field label="End point" htmlFor="end_point">
              <Input id="end_point" name="end_point" placeholder="End point" />
            </Field>
            <Button type="submit" variant="primary" className="w-fit">
              Create
            </Button>
          </form>
        </Card>
      </details>

      <ul className="mt-6 flex flex-col gap-3">
        {stories?.map((s) => (
          <li key={s.user_story_id}>
            <Link href={`/projects/${projectId}/stories/${s.user_story_id}`}>
              <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{s.title}</p>
                  <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status}</Badge>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {!error && (stories ?? []).length === 0 && <Card className="mt-6 text-sm text-muted">No stories yet.</Card>}
    </main>
  );
}
