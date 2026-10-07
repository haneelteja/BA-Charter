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
import { BackLink, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral" | "red"> = {
  Intake: "neutral",
  Analysing: "indigo",
  Brainstorm: "indigo",
  Decision: "amber",
  Accepted: "indigo",
  Deferred: "neutral",
  Rejected: "red",
  Propagated: "green",
};

const FINDING_TONE: Record<string, "neutral" | "amber" | "red"> = {
  Affected: "neutral",
  Undefined: "amber",
  Contradiction: "red",
  LowCoverage: "amber",
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}/changes`}>All change requests</BackLink>
      <PageHeader
        title={changeRequest.title}
        badge={<Badge tone={STATUS_TONE[changeRequest.status] ?? "neutral"}>{changeRequest.status}</Badge>}
        subtitle={
          (changeRequest.requested_by || changeRequest.urgency) &&
          `${changeRequest.requested_by ? `Requested by ${changeRequest.requested_by}` : ""}${
            changeRequest.urgency ? ` · ${changeRequest.urgency} urgency` : ""
          }`
        }
      />

      {/* Intake */}
      {changeRequest.status === "Intake" && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold">Intake</h2>
          <form action={updateForChange} className="mt-3 flex flex-col gap-3">
            <Field label="Title" htmlFor="cr-title">
              <Input id="cr-title" name="title" defaultValue={changeRequest.title} required />
            </Field>
            <Field label="Description" htmlFor="cr-description">
              <Textarea id="cr-description" name="description" defaultValue={changeRequest.description ?? ""} placeholder="Description" rows={4} />
            </Field>
            <Field label="Urgency" htmlFor="cr-urgency">
              <Select id="cr-urgency" name="urgency" defaultValue={changeRequest.urgency ?? ""}>
                <option value="">Urgency</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </Select>
            </Field>
            <Button type="submit" size="sm" className="w-fit">
              Save
            </Button>
          </form>
        </Card>
      )}
      {changeRequest.status !== "Intake" && changeRequest.description && (
        <p className="mt-6 text-sm">{changeRequest.description}</p>
      )}

      {/* Analyse */}
      {(changeRequest.status === "Intake" || changeRequest.status === "Analysing") && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Analyse</h2>
          <div className="mt-3">
            <AnalysisPanel projectId={projectId} changeRequestId={changeRequestId} />
          </div>
        </section>
      )}

      {(findings ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Findings</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {findings!.map((f) => (
              <li key={f.finding_id}>
                <Card className="text-xs">
                  <Badge tone={FINDING_TONE[f.finding_type] ?? "neutral"}>{f.finding_type}</Badge>
                  {f.confidence_score !== null && (
                    <span className="ml-2 text-muted">{Math.round(f.confidence_score * 100)}%</span>
                  )}
                  {f.ba_disposition && <span className="ml-2 text-muted">[{f.ba_disposition}]</span>}
                  <p className="mt-1.5 text-sm text-foreground">{f.detail}</p>
                  {!f.ba_disposition && changeRequest.status === "Analysing" && (
                    <form action={disposeForChange} className="mt-2 flex gap-2">
                      <input type="hidden" name="finding_id" value={f.finding_id} />
                      <Button type="submit" name="disposition" value="Accepted" size="sm">
                        Accept
                      </Button>
                      <Button type="submit" name="disposition" value="Dismissed" size="sm">
                        Dismiss
                      </Button>
                      <Button type="submit" name="disposition" value="RaisedAsClarification" size="sm">
                        Raise as clarification
                      </Button>
                    </form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {changeRequest.status === "Analysing" && (
        <form action={moveToBrainstormForChange} className="mt-4">
          <Button type="submit" variant="primary">
            Proceed to brainstorm
          </Button>
        </form>
      )}

      {/* Brainstorm */}
      {changeRequest.status === "Brainstorm" && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Brainstorm</h2>
          <div className="mt-3">
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
          <h2 className="text-sm font-semibold">Raised clarifications</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
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
          <Button type="submit" variant="primary">
            Proceed to decide
          </Button>
        </form>
      )}

      {/* Decide */}
      {changeRequest.status === "Decision" && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Decide</h2>
          {unresolvedBlockingClarifications.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {unresolvedBlockingClarifications.length} blocking clarification(s) still unanswered — deferring or
              rejecting will be blocked until resolved (§8 rule 9). Accepting is still allowed.
            </p>
          )}
          <form action={decideForChange} className="mt-3 flex flex-col gap-2">
            <Textarea name="rationale" placeholder="Decision rationale" required rows={2} />
            <div className="flex gap-2">
              <Button type="submit" name="outcome" value="Accepted" variant="primary" size="sm">
                Accept
              </Button>
              <Button type="submit" name="outcome" value="Deferred" size="sm">
                Defer to release
              </Button>
              <Button type="submit" name="outcome" value="Rejected" variant="danger" size="sm">
                Reject
              </Button>
            </div>
          </form>
        </section>
      )}

      {changeRequest.decision_rationale && (
        <p className="mt-4 text-xs text-muted">Decision rationale: {changeRequest.decision_rationale}</p>
      )}

      {/* Propagate */}
      {changeRequest.status === "Accepted" && (
        <section className="mt-8 border-t border-surface-border pt-6">
          <h2 className="text-sm font-semibold">Propagate</h2>
          <form action={generateEditsForChange} className="mt-3">
            <Button type="submit" size="sm">
              Generate proposed edits
            </Button>
          </form>

          {(proposedEdits ?? []).length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {proposedEdits!.map((edit) => (
                <li key={edit.proposed_edit_id}>
                  <Card className="text-xs">
                    <p className="font-medium text-sm">
                      {edit.target_object_type} · {edit.field_name}
                      <Badge className="ml-2">{edit.status}</Badge>
                    </p>
                    <p className="mt-1 text-muted">Current: {edit.current_value ?? "(empty)"}</p>
                    <p className="mt-1">Proposed: {edit.proposed_value}</p>
                    {edit.rationale && <p className="mt-1 text-muted">{edit.rationale}</p>}
                    {edit.status === "Pending" && (
                      <form action={reviewEditForChange} className="mt-2 flex gap-2">
                        <input type="hidden" name="proposed_edit_id" value={edit.proposed_edit_id} />
                        <Button type="submit" name="outcome" value="Approved" variant="primary" size="sm">
                          Approve
                        </Button>
                        <Button type="submit" name="outcome" value="Rejected" variant="danger" size="sm">
                          Reject
                        </Button>
                      </form>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <form action={notifyForChange} className="mt-4 flex items-center gap-2">
            <Button type="submit" size="sm">
              {changeRequest.notified_at ? "Re-notify delivery team" : "Notify delivery team"}
            </Button>
            {changeRequest.notified_at && (
              <span className="text-xs text-muted">
                Notified {new Date(changeRequest.notified_at).toLocaleString()}
              </span>
            )}
          </form>

          {unresolvedBlockingClarifications.length > 0 && (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
              {unresolvedBlockingClarifications.length} blocking clarification(s) still unanswered — closing will be
              blocked until resolved (§8 rule 9).
            </p>
          )}
          {pendingEditsCount > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {pendingEditsCount} proposed edit(s) still pending a decision.
            </p>
          )}

          <form action={completeForChange} className="mt-4">
            <Button type="submit" variant="primary">
              Close change request
            </Button>
          </form>
        </section>
      )}

      {changeRequest.status === "Propagated" && (
        <p className="mt-8 text-sm text-muted">This change request has been propagated and closed.</p>
      )}
      {(changeRequest.status === "Deferred" || changeRequest.status === "Rejected") && (
        <p className="mt-8 text-sm text-muted">This change request is {changeRequest.status.toLowerCase()}.</p>
      )}
    </main>
  );
}
