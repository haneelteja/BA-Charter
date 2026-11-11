import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createBlankDiagram, createSeededDiagram, deleteDiagram } from "./actions";
import { Card, Field, Input, PageHeader, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FlowDiagramsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: diagrams, error } = await supabase
    .from("flow_diagram")
    .select("diagram_id, title, updated_at, content")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  const createBlankForProject = createBlankDiagram.bind(null, projectId);
  const createSeededForProject = createSeededDiagram.bind(null, projectId);
  const deleteForProject = deleteDiagram.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader
        title="Flow Diagrams"
        subtitle="Design process flows on a freeform canvas — shapes, text, and connector lines you lay out yourself."
      />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <Card className="mt-8">
        <form className="flex flex-col gap-3">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" placeholder="e.g. Onboarding happy path" required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton formAction={createBlankForProject} variant="primary" pendingLabel="Creating…">
              + Blank diagram
            </SubmitButton>
            <SubmitButton formAction={createSeededForProject} pendingLabel="Seeding…">
              Seed from project data
            </SubmitButton>
          </div>
          <p className="text-xs text-muted">
            &quot;Seed from project data&quot; starts you off with a node per epic (and anything it&apos;s linked to)
            — you can rearrange, restyle, or delete any of it afterward.
          </p>
        </form>
      </Card>

      <ul className="mt-8 flex flex-col gap-3">
        {diagrams?.map((d) => {
          const nodeCount = Array.isArray(d.content?.nodes) ? d.content.nodes.length : 0;
          return (
            <li key={d.diagram_id}>
              <Card className="flex items-center justify-between gap-3 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                <Link href={`/projects/${projectId}/flow/${d.diagram_id}`} className="min-w-0 flex-1">
                  <p className="font-medium">{d.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {nodeCount} shape{nodeCount === 1 ? "" : "s"} · updated{" "}
                    {new Date(d.updated_at).toLocaleString()}
                  </p>
                </Link>
                <form action={deleteForProject.bind(null, d.diagram_id)}>
                  <SubmitButton
                    size="sm"
                    className="shrink-0 border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    pendingLabel="Deleting…"
                  >
                    Delete
                  </SubmitButton>
                </form>
              </Card>
            </li>
          );
        })}
      </ul>
      {!error && (diagrams ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No flow diagrams yet.</Card>
      )}
    </main>
  );
}
