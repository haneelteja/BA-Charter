import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { SpeakerMapSelect } from "./SpeakerMapSelect";
import {
  acceptCandidate,
  confirmInteraction,
  rejectCandidate,
  resolveContradiction,
  revertCandidate,
  triggerExtraction,
} from "./confirm-actions";
import { purgeInteractionNow } from "../actions";
import {
  approveAndDistribute,
  disputeMinutes,
  generateMinutes,
  updateMinutes,
} from "./minutes-actions";
import { BackLink, Badge, Button, Card, Input, PageHeader, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

const CANDIDATE_LABELS: Record<string, string> = {
  Decision: "Decision",
  ActionItem: "Action item",
  Clarification: "Clarification",
  Risk: "Risk",
  ChangeSignal: "Change signal",
};

export default async function InteractionDetailPage({
  params,
}: {
  params: Promise<{ id: string; interactionId: string }>;
}) {
  const { id: projectId, interactionId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  const role = await getProjectRole(supabase, projectId, auth.user.id);
  const userIsLead = isLead(role);

  const { data: interaction, error } = await supabase
    .from("interaction")
    .select("*")
    .eq("interaction_id", interactionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load interaction: ${error.message}`);
  }
  if (!interaction) {
    notFound();
  }

  const { data: utterances } = await supabase
    .from("utterance")
    .select("*")
    .eq("interaction_id", interactionId)
    .order("sequence_no");

  const { data: memberRows } = await supabase
    .from("project_member")
    .select("user_id")
    .eq("project_id", projectId);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: members } = memberIds.length
    ? await supabase.from("app_user").select("user_id, full_name, email").in("user_id", memberIds)
    : { data: [] };

  const { data: stakeholders } = await supabase
    .from("stakeholder")
    .select("stakeholder_id, full_name, email")
    .eq("project_id", projectId);

  const { data: candidates } = await supabase
    .from("extraction_candidate")
    .select("*")
    .eq("interaction_id", interactionId)
    .order("created_at");

  const { data: minutesDocs } = await supabase
    .from("minutes_document")
    .select("*")
    .eq("interaction_id", interactionId)
    .order("created_at", { ascending: false })
    .limit(1);
  const minutes = minutesDocs?.[0] ?? null;

  const speakerOptions = [
    ...(members ?? []).map((m) => ({ id: m.user_id, label: `${m.full_name} (member)`, kind: "user" as const })),
    ...(stakeholders ?? []).map((s) => ({
      id: s.stakeholder_id,
      label: `${s.full_name} (stakeholder)`,
      kind: "stakeholder" as const,
    })),
  ];

  const unmappedSpeakers = Array.from(
    new Set(
      (utterances ?? [])
        .filter((u) => u.speaker_label && !u.speaker_user_id && !u.speaker_stakeholder_id)
        .map((u) => u.speaker_label as string)
    )
  );

  const triggerForInteraction = triggerExtraction.bind(null, projectId, interactionId);
  const acceptForInteraction = acceptCandidate.bind(null, projectId, interactionId);
  const rejectForInteraction = rejectCandidate.bind(null, projectId, interactionId);
  const revertForInteraction = revertCandidate.bind(null, projectId, interactionId);
  const resolveForInteraction = resolveContradiction.bind(null, projectId, interactionId);
  const confirmForInteraction = confirmInteraction.bind(null, projectId, interactionId);
  const generateMinutesForInteraction = generateMinutes.bind(null, projectId, interactionId);
  const updateMinutesForInteraction = updateMinutes.bind(null, projectId, interactionId);
  const approveForInteraction = approveAndDistribute.bind(null, projectId, interactionId);
  const disputeForInteraction = disputeMinutes.bind(null, projectId, interactionId);
  const purgeForInteraction = purgeInteractionNow.bind(null, projectId, interactionId);

  const pendingCount = (candidates ?? []).filter((c) => c.status === "Pending").length;
  const contradicting = (candidates ?? []).filter((c) => c.status === "Pending" && c.contradicts_decision_id);
  const plainPending = (candidates ?? []).filter((c) => c.status === "Pending" && !c.contradicts_decision_id);
  const decided = (candidates ?? []).filter((c) => c.status !== "Pending");

  const recipientOptions = [
    ...(members ?? []).filter((m) => m.email).map((m) => ({ email: m.email as string, label: m.full_name })),
    ...(stakeholders ?? [])
      .filter((s) => s.email)
      .map((s) => ({ email: s.email as string, label: s.full_name })),
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}/interactions`}>All interactions</BackLink>
      <PageHeader
        title={interaction.title || `Untitled ${interaction.source_type}`}
        subtitle={`${interaction.source_type} · ${interaction.processing_status} · ${utterances?.length ?? 0} utterances`}
      />

      {interaction.is_purged ? (
        <p className="mt-2 text-xs text-muted">
          Content purged (EPIC 17) — structural record retained for traceability.
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          {interaction.purge_after && (
            <p className="text-xs text-muted">Scheduled purge: {interaction.purge_after}</p>
          )}
          {userIsLead && (
            <form action={purgeForInteraction}>
              <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                Purge now
              </button>
            </form>
          )}
        </div>
      )}

      {(interaction.processing_status === "Received" || interaction.processing_status === "Indexed") && (
        <Card className="mt-6">
          <form action={triggerForInteraction}>
            <Button type="submit" variant="primary">
              Run extraction
            </Button>
            <p className="mt-2 text-xs text-muted">
              Queues candidate decisions, action items, clarifications, risks and change signals.
            </p>
          </form>
        </Card>
      )}

      {(candidates ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">
            Candidates ({pendingCount} pending of {candidates?.length})
          </h2>

          {contradicting.length > 0 && (
            <Card className="mt-3 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Contradictions — Lead BA resolution required
              </h3>
              <ul className="mt-2 flex flex-col gap-3">
                {contradicting.map((c) => (
                  <li key={c.candidate_id} className="text-sm text-amber-900 dark:text-amber-200">
                    <p className="font-medium">{c.statement}</p>
                    <p className="text-xs">{c.contradiction_explanation}</p>
                    {userIsLead ? (
                      <form action={resolveForInteraction} className="mt-2 flex flex-col gap-2">
                        <input type="hidden" name="candidate_id" value={c.candidate_id} />
                        <Input
                          name="resolution_note"
                          placeholder="Resolution note"
                          required
                          className="border-amber-300 bg-white text-xs dark:border-amber-800 dark:bg-neutral-900"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="submit"
                            name="decision"
                            value="accept"
                            size="sm"
                            className="bg-amber-900 text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
                          >
                            Accept (supersedes old decision)
                          </Button>
                          <Button
                            type="submit"
                            name="decision"
                            value="reject"
                            size="sm"
                            className="border border-amber-900 text-amber-900 dark:border-amber-200 dark:text-amber-200"
                          >
                            Reject
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="mt-1 text-xs italic">Waiting on a Lead Business Analyst.</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {plainPending.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {plainPending.map((c) => (
                <li key={c.candidate_id}>
                  <Card>
                    <Badge>{CANDIDATE_LABELS[c.candidate_type]}</Badge>
                    <span className="ml-2 text-xs text-muted">
                      confidence {Math.round(c.confidence_score * 100)}%
                    </span>
                    <form action={acceptForInteraction} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="candidate_id" value={c.candidate_id} />
                      <Textarea name="statement" defaultValue={c.statement} rows={2} className="text-xs" />
                      {c.candidate_type !== "Risk" && c.candidate_type !== "ChangeSignal" && (
                        <Input name="suggested_owner" defaultValue={c.suggested_owner ?? ""} placeholder="Owner name" className="text-xs" />
                      )}
                      <div className="flex gap-2">
                        <Button type="submit" variant="primary" size="sm">
                          Accept
                        </Button>
                      </div>
                    </form>
                    <form action={rejectForInteraction} className="mt-1">
                      <input type="hidden" name="candidate_id" value={c.candidate_id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                        Reject
                      </button>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted">Decided ({decided.length})</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {decided.map((c) => (
                  <li key={c.candidate_id} className="text-xs text-muted">
                    [{c.status}] {CANDIDATE_LABELS[c.candidate_type]}: {c.statement}
                    {c.status === "Accepted" && (
                      <form action={revertForInteraction} className="inline">
                        <input type="hidden" name="candidate_id" value={c.candidate_id} />
                        <button type="submit" className="ml-2 text-indigo-600 underline dark:text-indigo-400">
                          revert
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {interaction.processing_status === "Extracted" && pendingCount === 0 && (candidates?.length ?? 0) > 0 && (
            <form action={confirmForInteraction} className="mt-4">
              <Button type="submit" variant="primary">
                Confirm &amp; continue to minutes
              </Button>
            </form>
          )}
        </section>
      )}

      {interaction.processing_status === "Confirmed" && !minutes && (
        <form action={generateMinutesForInteraction} className="mt-8">
          <Button type="submit" variant="primary">
            Generate minutes of meeting
          </Button>
        </form>
      )}

      {minutes && (
        <Card className="mt-8">
          <h2 className="text-sm font-semibold">
            Minutes of meeting — <span className="text-muted">{minutes.status}</span>
          </h2>

          {(minutes.status === "Draft" || minutes.status === "InReview") && (
            <form action={updateMinutesForInteraction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="minutes_id" value={minutes.minutes_id} />
              <Input name="subject" defaultValue={minutes.subject ?? ""} />
              <Textarea name="body_html" defaultValue={minutes.body_html ?? ""} rows={10} className="font-mono text-xs" />
              <Button type="submit" size="sm" className="w-fit">
                Save edits
              </Button>
            </form>
          )}

          {minutes.status !== "Draft" && minutes.status !== "InReview" && (
            <div
              className="prose prose-sm mt-3 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: minutes.body_html ?? "" }}
            />
          )}

          {minutes.status === "Draft" && userIsLead && recipientOptions.length > 0 && (
            <form action={approveForInteraction} className="mt-4 flex flex-col gap-2 border-t border-surface-border pt-4">
              <input type="hidden" name="minutes_id" value={minutes.minutes_id} />
              <p className="text-xs font-medium">Approve and distribute to:</p>
              {recipientOptions.map((r) => (
                <label key={r.email} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="recipients" value={r.email} defaultChecked />
                  {r.label} ({r.email})
                </label>
              ))}
              <Button type="submit" variant="primary" size="sm" className="mt-1 w-fit">
                Approve &amp; distribute
              </Button>
            </form>
          )}

          {minutes.status === "Distributed" && (
            <form action={disputeForInteraction} className="mt-4 flex flex-col gap-2 border-t border-surface-border pt-4">
              <input type="hidden" name="minutes_id" value={minutes.minutes_id} />
              <Textarea name="dispute_note" placeholder="Dispute reason" rows={2} className="border-red-300 dark:border-red-800" />
              <Button type="submit" variant="danger" size="sm" className="w-fit">
                Dispute minutes
              </Button>
            </form>
          )}
        </Card>
      )}

      {unmappedSpeakers.length > 0 && (members?.length || stakeholders?.length) ? (
        <Card className="mt-8 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Unmapped speakers: {unmappedSpeakers.join(", ")}
          </h2>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Map each utterance below to a project member or stakeholder.
          </p>
        </Card>
      ) : null}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
          Transcript ({utterances?.length ?? 0} utterances)
        </summary>
        <ul className="mt-3 flex flex-col gap-3">
          {utterances?.map((u) => (
            <li key={u.utterance_id}>
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{u.speaker_label ?? "Unknown speaker"}</span>
                  {u.speaker_label && !u.speaker_user_id && !u.speaker_stakeholder_id && (
                    <SpeakerMapSelect
                      projectId={projectId}
                      interactionId={interactionId}
                      utteranceId={u.utterance_id}
                      options={speakerOptions}
                    />
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{u.content}</p>
              </Card>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
