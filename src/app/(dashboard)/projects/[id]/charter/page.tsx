import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createKnowledgeNode,
  flagConflict,
  resolveConflict,
  updateKnowledgeNode,
} from "./actions";
import { Badge, BackLink, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const LAYER_LABELS: Record<string, string> = {
  SystemOverview: "System overview",
  FunctionalArea: "Functional areas",
  CapabilityRule: "Capabilities and rules",
  ImplementationNote: "Implementation notes",
};
const LAYER_ORDER = ["SystemOverview", "FunctionalArea", "CapabilityRule", "ImplementationNote"];

export default async function CharterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: nodes, error: nodesError } = await supabase
    .from("knowledge_node")
    .select("*")
    .eq("project_id", projectId)
    .order("layer")
    .order("title");

  const { data: conflicts, error: conflictsError } = await supabase
    .from("knowledge_conflict")
    .select("*, knowledge_node:knowledge_node_id(title)")
    .eq("project_id", projectId)
    .eq("status", "Open");

  const createForProject = createKnowledgeNode.bind(null, projectId);
  const flagForProject = flagConflict.bind(null, projectId);
  const resolveForProject = resolveConflict.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Charter" subtitle="The structured definition of what this application does, in four layers." />

      {(nodesError || conflictsError) && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {nodesError?.message ?? conflictsError?.message}
        </div>
      )}

      {conflicts && conflicts.length > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Open conflicts ({conflicts.length})
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {conflicts.map((c) => (
              <li key={c.conflict_id} className="text-sm text-amber-900 dark:text-amber-200">
                <p>
                  <span className="font-medium">{c.knowledge_node?.title}</span>: {c.description}
                </p>
                <form action={resolveForProject} className="mt-2 flex gap-2">
                  <input type="hidden" name="conflict_id" value={c.conflict_id} />
                  <Input
                    name="resolution_note"
                    placeholder="Resolution note (Lead BA only)"
                    required
                    className="flex-1 border-amber-300 bg-white dark:border-amber-800 dark:bg-neutral-900"
                  />
                  <Button type="submit" size="sm" className="border-amber-900 bg-amber-900 text-white hover:bg-amber-800 dark:border-amber-200 dark:bg-amber-200 dark:text-amber-950">
                    Resolve
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          + New charter entry
        </summary>
        <Card className="mt-4">
          <form action={createForProject} className="flex flex-col gap-3">
            <Field label="Layer" htmlFor="new-layer">
              <Select id="new-layer" name="layer" required>
                {LAYER_ORDER.map((layer) => (
                  <option key={layer} value={layer}>
                    {LAYER_LABELS[layer]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="new-title">
              <Input id="new-title" name="title" placeholder="Title" required />
            </Field>
            <Field label="Description" htmlFor="new-body">
              <Textarea id="new-body" name="body" placeholder="Description" rows={3} />
            </Field>
            <Button type="submit" variant="primary" className="w-fit">
              Add entry
            </Button>
          </form>
        </Card>
      </details>

      {LAYER_ORDER.map((layer) => {
        const layerNodes = (nodes ?? []).filter((n) => n.layer === layer);
        if (layerNodes.length === 0) return null;

        return (
          <section key={layer} className="mt-10">
            <h2 className="text-sm font-semibold">{LAYER_LABELS[layer]}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {layerNodes.map((node) => {
                const updateForNode = updateKnowledgeNode.bind(null, projectId, node.knowledge_node_id);
                return (
                  <li key={node.knowledge_node_id}>
                    <Card>
                      <div className="flex items-start justify-between gap-4">
                        <p className="font-medium">{node.title}</p>
                        <Badge tone={node.status === "InConflict" ? "amber" : "neutral"}>
                          {node.status} · v{node.version_no}
                        </Badge>
                      </div>
                      {node.body && <p className="mt-1 text-sm text-muted">{node.body}</p>}

                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
                          Edit
                        </summary>
                        <form action={updateForNode} className="mt-3 flex flex-col gap-2">
                          <input type="hidden" name="expected_version_no" value={node.version_no} />
                          <Input name="title" defaultValue={node.title} required />
                          <Textarea name="body" defaultValue={node.body ?? ""} rows={2} />
                          <Button type="submit" size="sm" className="w-fit">
                            Save (new version)
                          </Button>
                        </form>
                      </details>

                      {node.status !== "InConflict" && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-red-600 dark:hover:text-red-400">
                            Flag conflict
                          </summary>
                          <form action={flagForProject} className="mt-3 flex flex-col gap-2">
                            <input type="hidden" name="knowledge_node_id" value={node.knowledge_node_id} />
                            <Textarea
                              name="description"
                              placeholder="What contradicts this entry?"
                              required
                              rows={2}
                            />
                            <Button type="submit" variant="danger" size="sm" className="w-fit">
                              Flag
                            </Button>
                          </form>
                        </details>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!nodesError && (nodes ?? []).length === 0 && (
        <Card className="mt-10 text-sm text-muted">No charter entries yet.</Card>
      )}
    </main>
  );
}
