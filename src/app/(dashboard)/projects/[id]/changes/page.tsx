import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createChangeRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function ChangeRequestsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: changeRequests, error } = await supabase
    .from("change_request")
    .select("change_request_id, title, status, urgency, raised_at")
    .eq("project_id", projectId)
    .order("raised_at", { ascending: false });

  const createForProject = createChangeRequest.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Change requests</h1>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium">New change request</summary>
        <form action={createForProject} className="mt-4 flex flex-col gap-3">
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="description"
            placeholder="Description"
            rows={4}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="requested_by"
            placeholder="Requested by"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            name="urgency"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">Urgency</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
          <button
            type="submit"
            className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create
          </button>
        </form>
      </details>

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {changeRequests?.map((c) => (
          <li key={c.change_request_id} className="py-3">
            <Link href={`/projects/${projectId}/changes/${c.change_request_id}`} className="font-medium hover:underline">
              {c.title}
            </Link>
            <p className="text-xs text-neutral-500">
              {c.status}
              {c.urgency && ` · ${c.urgency}`}
            </p>
          </li>
        ))}
      </ul>
      {!error && (changeRequests ?? []).length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No change requests yet.</p>
      )}
    </main>
  );
}
