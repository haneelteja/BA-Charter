import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createKnowledgeNode,
  flagConflict,
  resolveConflict,
  updateKnowledgeNode,
} from "./actions";

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
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Charter</h1>
      <p className="mt-1 text-sm text-neutral-500">
        The structured definition of what this application does, in four layers.
      </p>

      {(nodesError || conflictsError) && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {nodesError?.message ?? conflictsError?.message}
        </div>
      )}

      {conflicts && conflicts.length > 0 && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Open conflicts ({conflicts.length})
          </h2>
          <ul className="mt-2 flex flex-col gap-3">
            {conflicts.map((c) => (
              <li key={c.conflict_id} className="text-sm text-amber-900 dark:text-amber-200">
                <p>
                  <span className="font-medium">{c.knowledge_node?.title}</span>: {c.description}
                </p>
                <form action={resolveForProject} className="mt-1 flex gap-2">
                  <input type="hidden" name="conflict_id" value={c.conflict_id} />
                  <input
                    name="resolution_note"
                    placeholder="Resolution note (Lead BA only)"
                    required
                    className="flex-1 rounded-md border border-amber-300 px-2 py-1 text-xs dark:border-amber-800 dark:bg-neutral-900"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white dark:bg-amber-200 dark:text-amber-950"
                  >
                    Resolve
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium">New charter entry</summary>
        <form action={createForProject} className="mt-4 flex flex-col gap-3">
          <select
            name="layer"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {LAYER_ORDER.map((layer) => (
              <option key={layer} value={layer}>
                {LAYER_LABELS[layer]}
              </option>
            ))}
          </select>
          <input
            name="title"
            placeholder="Title"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="body"
            placeholder="Description"
            rows={3}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Add entry
          </button>
        </form>
      </details>

      {LAYER_ORDER.map((layer) => {
        const layerNodes = (nodes ?? []).filter((n) => n.layer === layer);
        if (layerNodes.length === 0) return null;

        return (
          <section key={layer} className="mt-10">
            <h2 className="text-sm font-medium">{LAYER_LABELS[layer]}</h2>
            <ul className="mt-3 flex flex-col gap-4">
              {layerNodes.map((node) => {
                const updateForNode = updateKnowledgeNode.bind(null, projectId, node.knowledge_node_id);
                return (
                  <li
                    key={node.knowledge_node_id}
                    className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-medium">{node.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                          node.status === "InConflict"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                      >
                        {node.status} · v{node.version_no}
                      </span>
                    </div>
                    {node.body && <p className="mt-1 text-sm text-neutral-500">{node.body}</p>}

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-neutral-500">Edit</summary>
                      <form action={updateForNode} className="mt-2 flex flex-col gap-2">
                        <input
                          name="title"
                          defaultValue={node.title}
                          required
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                        />
                        <textarea
                          name="body"
                          defaultValue={node.body ?? ""}
                          rows={2}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                        />
                        <button
                          type="submit"
                          className="w-fit rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                        >
                          Save (new version)
                        </button>
                      </form>
                    </details>

                    {node.status !== "InConflict" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-neutral-500">
                          Flag conflict
                        </summary>
                        <form action={flagForProject} className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="knowledge_node_id" value={node.knowledge_node_id} />
                          <textarea
                            name="description"
                            placeholder="What contradicts this entry?"
                            required
                            rows={2}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <button
                            type="submit"
                            className="w-fit rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                          >
                            Flag
                          </button>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!nodesError && (nodes ?? []).length === 0 && (
        <p className="mt-10 text-sm text-neutral-500">No charter entries yet.</p>
      )}
    </main>
  );
}
