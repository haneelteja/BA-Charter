import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  completePropagation,
  decideChangeRequest,
  disposeFinding,
  generateEditsForChangeRequest,
  moveToBrainstorm,
  moveToDecide,
  raiseClarificationFromChangeRequest,
  reviewProposedEdit,
  sendChangeNotification,
  updateChangeRequest,
} from "../actions";
import { AnalysisPanel } from "./AnalysisPanel";
import { BrainstormPanel } from "./BrainstormPanel";

export const dynamic = "force-dynamic";

const FINDING_TYPE_STYLES: Record<string, string> = {
  Affected: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  Undefined: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  Contradiction: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  LowCoverage: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export default async function ChangeRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string; changeRequestId: string }>;
}) {
  const { id: projectId, changeRequestId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { data: changeRequest, error } = await supabase
    .from("change_request")
    .select("*")
    .eq("change_request_id", changeRequestId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load change request: ${error.message}`);
  if (!changeRequest) notFound();

  const { data: findings } = await supabase
    .from("impact_finding")
    .select("*")
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: false });

  const { data: traceLinks } = await supabase
    .from("trace_link")
    .select("from_object_id")
    .eq("from_object_type", "Clarification")
    .eq("to_object_type", "ChangeRequest")
    .eq("to_object_id", changeRequestId);

  const clarificationIds = (traceLinks ?? []).map((l) => l.from_object_id);
  const { data: clarifications } = clarificationIds.length
    ? await supabase
        .from("clarification")
        .select("clarification_id, question, status, is_blocking, audience_type")
        .in("clarification_id", clarificationIds)
    : { data: [] };

  const { data: proposedEdits } = await supabase
    .from("proposed_edit")
    .select("*")
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: false });

  const updateForChange = updateChangeRequest.bind(null, projectId, changeRequestId);
  const disposeForChange = disposeFinding.bind(null, projectId, changeRequestId);
  const moveToBrainstormForChange = moveToBrainstorm.bind(null, projectId, changeRequestId);
  const raiseClarificationForChange = raiseClarificationFromChangeRequest.bind(null, projectId, changeRequestId);
  const moveToDecideForChange = moveToDecide.bind(null, projectId, changeRequestId);
  const decideForChange = decideChangeRequest.bind(null, projectId, changeRequestId);
  const generateEditsForChange = generateEditsForChangeRequest.bind(null, projectId, changeRequestId);
  const reviewEditForChange = reviewProposedEdit.bind(null, projectId, changeRequestId);
  const notifyForChange = sendChangeNotification.bind(null, projectId, changeRequestId);
  const completeForChange = completePropagation.bind(null, projectId, changeRequestId);

  const pendingEditsCount = (proposedEdits ?? []).filter((e) => e.status === "Pending").length;
  const unresolvedBlockingClarifications = (clarifications ?? []).filter(
    (c) => c.is_blocking && c.status !== "Confirmed" && c.status !== "Withdrawn"
  );

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}/changes`} className="text-sm text-neutral-500 hover:underline">
        ← All change requests
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{changeRequest.title}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
          {changeRequest.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {changeRequest.requested_by && `Requested by ${changeRequest.requested_by}`}
        {changeRequest.urgency && ` · ${changeRequest.urgency} urgency`}
      </p>

      {/* Intake */}
      {changeRequest.status === "Intake" && (
        <form action={updateForChange} className="mt-6 flex flex-col gap-2">
          <h2 className="text-sm font-medium">Intake</h2>
          <input
            name="title"
            defaultValue={changeRequest.title}
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <textarea
            name="description"
            defaultValue={changeRequest.description ?? ""}
            placeholder="Description"
            rows={4}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            name="urgency"
            defaultValue={changeRequest.urgency ?? ""}
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
            className="w-fit rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Save
          </button>
        </form>
      )}
      {changeRequest.status !== "Intake" && changeRequest.description && (
        <p className="mt-6 text-sm">{changeRequest.description}</p>
      )}

      {/* Analyse */}
      {(changeRequest.status === "Intake" || changeRequest.status === "Analysing") && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Analyse</h2>
          <div className="mt-2">
            <AnalysisPanel projectId={projectId} changeRequestId={changeRequestId} />
          </div>
        </section>
      )}

      {(findings ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Findings</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {findings!.map((f) => (
              <li key={f.finding_id} className="rounded-md border border-neutral-200 p-3 text-xs dark:border-neutral-800">
                <span className={`rounded-full px-2 py-0.5 ${FINDING_TYPE_STYLES[f.finding_type] ?? ""}`}>
                  {f.finding_type}
                </span>
                {f.confidence_score !== null && (
                  <span className="ml-2 text-neutral-500">{Math.round(f.confidence_score * 100)}%</span>
                )}
                {f.ba_disposition && <span className="ml-2 text-neutral-500">[{f.ba_disposition}]</span>}
                <p className="mt-1">{f.detail}</p>
                {!f.ba_disposition && changeRequest.status === "Analysing" && (
                  <form action={disposeForChange} className="mt-2 flex gap-2">
                    <input type="hidden" name="finding_id" value={f.finding_id} />
                    <button
                      type="submit"
                      name="disposition"
                      value="Accepted"
                      className="rounded-full border border-neutral-300 px-2 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Accept
                    </button>
                    <button
                      type="submit"
                      name="disposition"
                      value="Dismissed"
                      className="rounded-full border border-neutral-300 px-2 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Dismiss
                    </button>
                    <button
                      type="submit"
                      name="disposition"
                      value="RaisedAsClarification"
                      className="rounded-full border border-neutral-300 px-2 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Raise as clarification
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {changeRequest.status === "Analysing" && (
        <form action={moveToBrainstormForChange} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Proceed to brainstorm
          </button>
        </form>
      )}

      {/* Brainstorm */}
      {changeRequest.status === "Brainstorm" && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Brainstorm</h2>
          <div className="mt-2">
            <BrainstormPanel
              projectId={projectId}
              changeRequestId={changeRequestId}
              raiseAction={raiseClarificationForChange}
            />
          </div>
        </section>
      )}

      {(clarifications ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Raised clarifications</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-500">
            {clarifications!.map((c) => (
              <li key={c.clarification_id}>
                [{c.status}] {c.question} {c.is_blocking && "(blocking)"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {changeRequest.status === "Brainstorm" && (
        <form action={moveToDecideForChange} className="mt-4">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Proceed to decide
          </button>
        </form>
      )}

      {/* Decide */}
      {changeRequest.status === "Decision" && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Decide</h2>
          {unresolvedBlockingClarifications.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {unresolvedBlockingClarifications.length} blocking clarification(s) still unanswered — deferring or
              rejecting will be blocked until resolved (§8 rule 9). Accepting is still allowed.
            </p>
          )}
          <form action={decideForChange} className="mt-2 flex flex-col gap-2">
            <textarea
              name="rationale"
              placeholder="Decision rationale"
              required
              rows={2}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                name="outcome"
                value="Accepted"
                className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Accept
              </button>
              <button
                type="submit"
                name="outcome"
                value="Deferred"
                className="rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Defer to release
              </button>
              <button
                type="submit"
                name="outcome"
                value="Rejected"
                className="rounded-full border border-red-300 px-4 py-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                Reject
              </button>
            </div>
          </form>
        </section>
      )}

      {changeRequest.decision_rationale && (
        <p className="mt-4 text-xs text-neutral-500">Decision rationale: {changeRequest.decision_rationale}</p>
      )}

      {/* Propagate */}
      {changeRequest.status === "Accepted" && (
        <section className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Propagate</h2>
          <form action={generateEditsForChange} className="mt-2">
            <button
              type="submit"
              className="rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Generate proposed edits
            </button>
          </form>

          {(proposedEdits ?? []).length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {proposedEdits!.map((edit) => (
                <li
                  key={edit.proposed_edit_id}
                  className="rounded-md border border-neutral-200 p-3 text-xs dark:border-neutral-800"
                >
                  <p className="font-medium">
                    {edit.target_object_type} · {edit.field_name}
                    <span className="ml-2 text-neutral-500">[{edit.status}]</span>
                  </p>
                  <p className="mt-1 text-neutral-500">Current: {edit.current_value ?? "(empty)"}</p>
                  <p className="mt-1">Proposed: {edit.proposed_value}</p>
                  {edit.rationale && <p className="mt-1 text-neutral-500">{edit.rationale}</p>}
                  {edit.status === "Pending" && (
                    <form action={reviewEditForChange} className="mt-2 flex gap-2">
                      <input type="hidden" name="proposed_edit_id" value={edit.proposed_edit_id} />
                      <button
                        type="submit"
                        name="outcome"
                        value="Approved"
                        className="rounded-full bg-foreground px-3 py-1 font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                      >
                        Approve
                      </button>
                      <button
                        type="submit"
                        name="outcome"
                        value="Rejected"
                        className="rounded-full border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Reject
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form action={notifyForChange} className="mt-4">
            <button
              type="submit"
              className="rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {changeRequest.notified_at ? "Re-notify delivery team" : "Notify delivery team"}
            </button>
            {changeRequest.notified_at && (
              <span className="ml-2 text-xs text-neutral-500">
                Notified {new Date(changeRequest.notified_at).toLocaleString()}
              </span>
            )}
          </form>

          {unresolvedBlockingClarifications.length > 0 && (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
              {unresolvedBlockingClarifications.length} blocking clarification(s) still unanswered — closing will be
              blocked until resolved (§8 rule 9).
            </p>
          )}
          {pendingEditsCount > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {pendingEditsCount} proposed edit(s) still pending a decision.
            </p>
          )}

          <form action={completeForChange} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Close change request
            </button>
          </form>
        </section>
      )}

      {changeRequest.status === "Propagated" && (
        <p className="mt-8 text-sm text-neutral-500">This change request has been propagated and closed.</p>
      )}
      {(changeRequest.status === "Deferred" || changeRequest.status === "Rejected") && (
        <p className="mt-8 text-sm text-neutral-500">This change request is {changeRequest.status.toLowerCase()}.</p>
      )}
    </main>
  );
}
