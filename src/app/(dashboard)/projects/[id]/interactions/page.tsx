import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createInteraction } from "./actions";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = ["Transcript", "Email", "Chat", "ManualNote", "Document"];

export default async function InteractionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: interactions, error } = await supabase
    .from("interaction")
    .select("interaction_id, source_type, title, occurred_at, processing_status, ingested_at")
    .eq("project_id", projectId)
    .order("ingested_at", { ascending: false });

  const createForProject = createInteraction.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Interactions</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Transcripts, emails, chats and notes captured for this project.
      </p>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium">Capture new interaction</summary>
        <form action={createForProject} className="mt-4 flex flex-col gap-3">
          <select
            name="source_type"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            name="title"
            placeholder="Title (optional)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="occurred_at"
            type="datetime-local"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="content"
            placeholder={
              "Paste the transcript, email or notes here.\nFor multi-speaker transcripts, use \"Speaker Name: what they said\" per line."
            }
            required
            rows={10}
            className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Capture
          </button>
        </form>
      </details>

      <ul className="mt-10 divide-y divide-neutral-200 dark:divide-neutral-800">
        {interactions?.map((i) => (
          <li key={i.interaction_id} className="py-3">
            <Link
              href={`/projects/${projectId}/interactions/${i.interaction_id}`}
              className="font-medium hover:underline"
            >
              {i.title || `Untitled ${i.source_type}`}
            </Link>
            <p className="text-xs text-neutral-500">
              {i.source_type} · {i.processing_status}
            </p>
          </li>
        ))}
      </ul>
      {!error && (interactions ?? []).length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No interactions captured yet.</p>
      )}
    </main>
  );
}
