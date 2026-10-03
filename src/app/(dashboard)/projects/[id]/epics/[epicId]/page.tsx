import Link from "next/link";
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

export const dynamic = "force-dynamic";

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
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}/epics`} className="text-sm text-neutral-500 hover:underline">
        ← All epics
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{epic.title}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
          {epic.status}
        </span>
      </div>
      {epic.agile_studio_ref && (
        <p className="mt-1 text-xs text-neutral-500">Agile Studio ref: {epic.agile_studio_ref}</p>
      )}

      {epic.status === "Draft" && (
        <form action={updateForEpic} className="mt-6 flex flex-col gap-2">
          <input
            name="title"
            defaultValue={epic.title}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="business_objective"
            defaultValue={epic.business_objective ?? ""}
            placeholder="Business objective"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="in_scope"
            defaultValue={epic.in_scope ?? ""}
            placeholder="In scope"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="out_of_scope"
            defaultValue={epic.out_of_scope ?? ""}
            placeholder="Out of scope"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="w-fit rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Save
          </button>
        </form>
      )}
      {epic.status !== "Draft" && (
        <div className="mt-6 text-sm">
          {epic.business_objective && <p>{epic.business_objective}</p>}
          {epic.in_scope && <p className="mt-1 text-neutral-500">In scope: {epic.in_scope}</p>}
          {epic.out_of_scope && <p className="mt-1 text-neutral-500">Out of scope: {epic.out_of_scope}</p>}
        </div>
      )}

      <h2 className="mt-8 text-sm font-medium">Linked decisions &amp; charter entries</h2>
      <ul className="mt-2 flex flex-col gap-1">
        {linkedDecisions?.map((d) => {
          const link = links?.find((l) => l.to_object_id === d.decision_id);
          return (
            <li key={d.decision_id} className="flex items-center justify-between text-sm">
              <span>Decision: {d.statement}</span>
              {epic.status === "Draft" && link && (
                <form action={unlinkForEpic}>
                  <input type="hidden" name="trace_link_id" value={link.trace_link_id} />
                  <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                    Unlink
                  </button>
                </form>
              )}
            </li>
          );
        })}
        {linkedNodes?.map((n) => {
          const link = links?.find((l) => l.to_object_id === n.knowledge_node_id);
          return (
            <li key={n.knowledge_node_id} className="flex items-center justify-between text-sm">
              <span>Charter: {n.title}</span>
              {epic.status === "Draft" && link && (
                <form action={unlinkForEpic}>
                  <input type="hidden" name="trace_link_id" value={link.trace_link_id} />
                  <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                    Unlink
                  </button>
                </form>
              )}
            </li>
          );
        })}
        {(links ?? []).length === 0 && <p className="text-sm text-neutral-500">No links yet.</p>}
      </ul>

      {epic.status === "Draft" && (
        <form action={linkForEpic} className="mt-3 flex items-center gap-2">
          <select
            name="target_type"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="Decision">Decision</option>
            <option value="KnowledgeNode">Charter entry</option>
          </select>
          <select
            name="target_id"
            className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
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
          </select>
          <button
            type="submit"
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Link
          </button>
        </form>
      )}

      {epic.status === "Draft" && (
        <form action={submitForEpic} className="mt-6">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Submit for review
          </button>
        </form>
      )}

      {epic.status === "InReview" && userIsLead && (
        <form action={reviewForEpic} className="mt-6 flex flex-col gap-2">
          <textarea
            name="comments"
            placeholder="Review comments"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              name="outcome"
              value="Approved"
              className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Approve
            </button>
            <button
              type="submit"
              name="outcome"
              value="ReturnedForRework"
              className="rounded-full border border-red-300 px-4 py-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              Return for rework
            </button>
          </div>
        </form>
      )}
      {epic.status === "InReview" && !userIsLead && (
        <p className="mt-6 text-sm text-neutral-500">Awaiting Lead BA review.</p>
      )}

      {epic.status === "Approved" && (
        <form action={publishForEpic} className="mt-6">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Publish to Agile Studio
          </button>
        </form>
      )}

      {reviews && reviews.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium">Review history</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
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
