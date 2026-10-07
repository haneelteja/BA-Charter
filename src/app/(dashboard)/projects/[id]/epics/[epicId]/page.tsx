import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole, isLead } from "@/lib/projects/role";
import {
  linkEpic,
  publishEpic,
  reviewEpic,
  submitEpicForReview,
  unlinkEpic,
  updateEpic,
} from "../actions";
import { BackLink, Badge, Button, Card, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral"> = {
  Draft: "neutral",
  InReview: "amber",
  Approved: "indigo",
  Published: "green",
};

export default async function EpicDetailPage({
  params,
}: {
  params: Promise<{ id: string; epicId: string }>;
}) {
  const { id: projectId, epicId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  const role = await getProjectRole(supabase, projectId, auth.user.id);
  const userIsLead = isLead(role);

  const { data: epic, error } = await supabase
    .from("epic")
    .select("*")
    .eq("epic_id", epicId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load epic: ${error.message}`);
  if (!epic) notFound();

  const { data: links } = await supabase
    .from("trace_link")
    .select("*")
    .eq("from_object_type", "Epic")
    .eq("from_object_id", epicId);

  const decisionIds = (links ?? []).filter((l) => l.to_object_type === "Decision").map((l) => l.to_object_id);
  const nodeIds = (links ?? []).filter((l) => l.to_object_type === "KnowledgeNode").map((l) => l.to_object_id);
  const { data: linkedDecisions } = decisionIds.length
    ? await supabase.from("decision").select("decision_id, statement").in("decision_id", decisionIds)
    : { data: [] };
  const { data: linkedNodes } = nodeIds.length
    ? await supabase.from("knowledge_node").select("knowledge_node_id, title").in("knowledge_node_id", nodeIds)
    : { data: [] };

  const { data: candidateDecisions } = await supabase
    .from("decision")
    .select("decision_id, statement")
    .eq("project_id", projectId)
    .eq("status", "Confirmed");
  const { data: candidateNodes } = await supabase
    .from("knowledge_node")
    .select("knowledge_node_id, title")
    .eq("project_id", projectId)
    .eq("status", "Active");

  const { data: reviews } = await supabase
    .from("review")
    .select("*")
    .eq("target_object_type", "Epic")
    .eq("target_object_id", epicId)
    .order("reviewed_at", { ascending: false });

  const updateForEpic = updateEpic.bind(null, projectId, epicId);
  const linkForEpic = linkEpic.bind(null, projectId, epicId);
  const unlinkForEpic = unlinkEpic.bind(null, projectId, epicId);
  const submitForEpic = submitEpicForReview.bind(null, projectId, epicId);
  const reviewForEpic = reviewEpic.bind(null, projectId, epicId);
  const publishForEpic = publishEpic.bind(null, projectId, epicId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}/epics`}>All epics</BackLink>
      <PageHeader
        title={epic.title}
        badge={<Badge tone={STATUS_TONE[epic.status] ?? "neutral"}>{epic.status}</Badge>}
        subtitle={epic.agile_studio_ref && `Agile Studio ref: ${epic.agile_studio_ref}`}
      />

      {epic.status === "Draft" && (
        <Card className="mt-6">
          <form action={updateForEpic} className="flex flex-col gap-2">
            <input
              name="title"
              defaultValue={epic.title}
              required
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <Textarea name="business_objective" defaultValue={epic.business_objective ?? ""} placeholder="Business objective" rows={2} />
            <Textarea name="in_scope" defaultValue={epic.in_scope ?? ""} placeholder="In scope" rows={2} />
            <Textarea name="out_of_scope" defaultValue={epic.out_of_scope ?? ""} placeholder="Out of scope" rows={2} />
            <Button type="submit" size="sm" className="w-fit">
              Save
            </Button>
          </form>
        </Card>
      )}
      {epic.status !== "Draft" && (
        <div className="mt-6 text-sm">
          {epic.business_objective && <p>{epic.business_objective}</p>}
          {epic.in_scope && <p className="mt-1 text-muted">In scope: {epic.in_scope}</p>}
          {epic.out_of_scope && <p className="mt-1 text-muted">Out of scope: {epic.out_of_scope}</p>}
        </div>
      )}

      <h2 className="mt-8 text-sm font-semibold">Linked decisions &amp; charter entries</h2>
      <Card className="mt-3 divide-y divide-surface-border p-0">
        {linkedDecisions?.map((d) => {
          const link = links?.find((l) => l.to_object_id === d.decision_id);
          return (
            <div key={d.decision_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>Decision: {d.statement}</span>
              {epic.status === "Draft" && link && (
                <form action={unlinkForEpic}>
                  <input type="hidden" name="trace_link_id" value={link.trace_link_id} />
                  <button type="submit" className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400">
                    Unlink
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {linkedNodes?.map((n) => {
          const link = links?.find((l) => l.to_object_id === n.knowledge_node_id);
          return (
            <div key={n.knowledge_node_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>Charter: {n.title}</span>
              {epic.status === "Draft" && link && (
                <form action={unlinkForEpic}>
                  <input type="hidden" name="trace_link_id" value={link.trace_link_id} />
                  <button type="submit" className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400">
                    Unlink
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {(links ?? []).length === 0 && <p className="px-4 py-2.5 text-sm text-muted">No links yet.</p>}
      </Card>

      {epic.status === "Draft" && (
        <form action={linkForEpic} className="mt-3 flex items-center gap-2">
          <Select name="target_type" className="w-40">
            <option value="Decision">Decision</option>
            <option value="KnowledgeNode">Charter entry</option>
          </Select>
          <Select name="target_id" className="flex-1">
            <optgroup label="Confirmed decisions">
              {candidateDecisions?.map((d) => (
                <option key={d.decision_id} value={d.decision_id}>
                  {d.statement.slice(0, 60)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Charter entries">
              {candidateNodes?.map((n) => (
                <option key={n.knowledge_node_id} value={n.knowledge_node_id}>
                  {n.title}
                </option>
              ))}
            </optgroup>
          </Select>
          <Button type="submit" size="sm">
            Link
          </Button>
        </form>
      )}

      {epic.status === "Draft" && (
        <form action={submitForEpic} className="mt-6">
          <Button type="submit" variant="primary">
            Submit for review
          </Button>
        </form>
      )}

      {epic.status === "InReview" && userIsLead && (
        <Card className="mt-6">
          <form action={reviewForEpic} className="flex flex-col gap-2">
            <Textarea name="comments" placeholder="Review comments" rows={2} />
            <div className="flex gap-2">
              <Button type="submit" name="outcome" value="Approved" variant="primary" size="sm">
                Approve
              </Button>
              <Button type="submit" name="outcome" value="ReturnedForRework" variant="danger" size="sm">
                Return for rework
              </Button>
            </div>
          </form>
        </Card>
      )}
      {epic.status === "InReview" && !userIsLead && (
        <p className="mt-6 text-sm text-muted">Awaiting Lead BA review.</p>
      )}

      {epic.status === "Approved" && (
        <form action={publishForEpic} className="mt-6">
          <Button type="submit" variant="primary">
            Publish to Agile Studio
          </Button>
        </form>
      )}

      {reviews && reviews.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold">Review history</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
            {reviews.map((r) => (
              <li key={r.review_id}>
                [{r.outcome}] {r.comments}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
