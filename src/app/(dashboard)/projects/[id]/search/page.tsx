import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ALL_SCOPES, searchProject, type RetrievalScope } from "@/lib/ai/search";
import { BackLink, Badge, Button, Card, Input, PageHeader } from "@/components/ui";

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Search" subtitle="Semantic search across everything embedded in this project." />

      {!project?.embedding_provider && (
        <p className="mt-6 text-sm text-amber-700 dark:text-amber-400">
          No embedding model configured for this project yet — a Lead BA can set one on the project page.
        </p>
      )}

      <form method="get" className="mt-6 flex flex-col gap-3">
        <Input name="q" defaultValue={query} placeholder="Search decisions, transcripts, charter entries…" />
        <div className="flex flex-wrap gap-3 text-xs">
          {ALL_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" name="scope" value={s} defaultChecked={selectedScope.includes(s)} />
              {s}
            </label>
          ))}
        </div>
        <Button type="submit" variant="primary" className="w-fit">
          Search
        </Button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {query && !error && results.length === 0 && (
        <Card className="mt-6 text-sm text-muted">No results.</Card>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {results.map((r) => (
          <li key={`${r.object_type}-${r.object_id}`}>
            <Card>
              <div className="flex items-center justify-between gap-2">
                <Badge>{r.object_type}</Badge>
                <span className="text-xs text-muted">{Math.round(r.relevance_score * 100)}% match</span>
              </div>
              <p className="mt-1.5 text-sm text-foreground/80">{r.snippet}</p>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
