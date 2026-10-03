import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createEpic } from "./actions";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Epics</h1>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium">New epic</summary>
        <form action={createForProject} className="mt-4 flex flex-col gap-3">
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="business_objective"
            placeholder="Business objective"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="in_scope"
            placeholder="In scope"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="out_of_scope"
            placeholder="Out of scope"
            rows={2}
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
        {epics?.map((e) => (
          <li key={e.epic_id} className="py-3">
            <Link href={`/projects/${projectId}/epics/${e.epic_id}`} className="font-medium hover:underline">
              {e.title}
            </Link>
            <p className="text-xs text-neutral-500">{e.status}</p>
          </li>
        ))}
      </ul>
      {!error && (epics ?? []).length === 0 && <p className="mt-6 text-sm text-neutral-500">No epics yet.</p>}
    </main>
  );
}
