import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createUserStory } from "./actions";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">User stories</h1>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium">New story</summary>
        <form action={createForProject} className="mt-4 flex flex-col gap-3">
          <select
            name="epic_id"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">(no parent epic)</option>
            {epics?.map((e) => (
              <option key={e.epic_id} value={e.epic_id}>
                {e.title}
              </option>
            ))}
          </select>
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="actor"
            placeholder="Actor"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="goal"
            placeholder="Goal"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="business_value"
            placeholder="Business value"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="starting_point"
            placeholder="Starting point"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="end_point"
            placeholder="End point"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create
          </button>
        </form>
      </details>

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {stories?.map((s) => (
          <li key={s.user_story_id} className="py-3">
            <Link href={`/projects/${projectId}/stories/${s.user_story_id}`} className="font-medium hover:underline">
              {s.title}
            </Link>
            <p className="text-xs text-neutral-500">{s.status}</p>
          </li>
        ))}
      </ul>
      {!error && (stories ?? []).length === 0 && <p className="mt-6 text-sm text-neutral-500">No stories yet.</p>}
    </main>
  );
}
