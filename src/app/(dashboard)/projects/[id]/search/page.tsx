import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ALL_SCOPES, searchProject, type RetrievalScope } from "@/lib/ai/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; scope?: string | string[] }>;
}) {
  const { id: projectId } = await params;
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const selectedScope = (
    sp.scope ? (Array.isArray(sp.scope) ? sp.scope : [sp.scope]) : [...ALL_SCOPES]
  ) as RetrievalScope[];

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { data: project } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();

  let results: Awaited<ReturnType<typeof searchProject>> = [];
  let error: string | null = null;

  if (query && project?.embedding_provider && project?.embedding_model) {
    try {
      results = await searchProject(supabase, projectId, auth.user.id, query, selectedScope);
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Search</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Semantic search across everything embedded in this project.
      </p>

      {!project?.embedding_provider && (
        <p className="mt-6 text-sm text-amber-700 dark:text-amber-300">
          No embedding model configured for this project yet — a Lead BA can set one on the project page.
        </p>
      )}

      <form method="get" className="mt-6 flex flex-col gap-3">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search decisions, transcripts, charter entries…"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex flex-wrap gap-3 text-xs">
          {ALL_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1">
              <input type="checkbox" name="scope" value={s} defaultChecked={selectedScope.includes(s)} />
              {s}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {query && !error && results.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No results.</p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {results.map((r) => (
          <li
            key={`${r.object_type}-${r.object_id}`}
            className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                {r.object_type}
              </span>
              <span className="text-xs text-neutral-500">{Math.round(r.relevance_score * 100)}% match</span>
            </div>
            <p className="mt-1 text-neutral-700 dark:text-neutral-300">{r.snippet}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
