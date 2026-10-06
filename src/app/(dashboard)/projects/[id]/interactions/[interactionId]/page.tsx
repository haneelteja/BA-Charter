import Link from "next/link";
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
    <main className="mx-auto max-w-3xl p-8">
      <Link
        href={`/projects/${projectId}/interactions`}
        className="text-sm text-neutral-500 hover:underline"
      >
        ← All interactions
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {interaction.title || `Untitled ${interaction.source_type}`}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {interaction.source_type} · {interaction.processing_status} ·{" "}
        {utterances?.length ?? 0} utterances
      </p>

      {interaction.is_purged ? (
        <p className="mt-2 text-xs text-neutral-500">
          Content purged (EPIC 17) — structural record retained for traceability.
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          {interaction.purge_after && (
            <p className="text-xs text-neutral-500">Scheduled purge: {interaction.purge_after}</p>
          )}
          {userIsLead && (
            <form action={purgeForInteraction}>
              <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                Purge now
              </button>
            </form>
          )}
        </div>
      )}

      {(interaction.processing_status === "Received" || interaction.processing_status === "Indexed") && (
        <form action={triggerForInteraction} className="mt-6">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Run extraction
          </button>
          <p className="mt-1 text-xs text-neutral-500">
            Queues candidate decisions, action items, clarifications, risks and change signals.
          </p>
        </form>
      )}

      {(candidates ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">
            Candidates ({pendingCount} pending of {candidates?.length})
          </h2>

          {contradicting.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <h3 className="text-sm font-medium text-amber-900 dark:text-amber-200">
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
                        <input
                          name="resolution_note"
                          placeholder="Resolution note"
                          required
                          className="rounded-md border border-amber-300 px-2 py-1 text-xs dark:border-amber-800 dark:bg-neutral-900"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            name="decision"
                            value="accept"
                            className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white dark:bg-amber-200 dark:text-amber-950"
                          >
                            Accept (supersedes old decision)
                          </button>
                          <button
                            type="submit"
                            name="decision"
                            value="reject"
                            className="rounded-full border border-amber-900 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-200 dark:text-amber-200"
                          >
                            Reject
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="mt-1 text-xs italic">Waiting on a Lead Business Analyst.</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plainPending.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {plainPending.map((c) => (
                <li
                  key={c.candidate_id}
                  className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                >
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                    {CANDIDATE_LABELS[c.candidate_type]}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500">
                    confidence {Math.round(c.confidence_score * 100)}%
                  </span>
                  <form action={acceptForInteraction} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="candidate_id" value={c.candidate_id} />
                    <textarea
                      name="statement"
                      defaultValue={c.statement}
                      rows={2}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    />
                    {c.candidate_type !== "Risk" && c.candidate_type !== "ChangeSignal" && (
                      <input
                        name="suggested_owner"
                        defaultValue={c.suggested_owner ?? ""}
                        placeholder="Owner name"
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                      >
                        Accept
                      </button>
                    </div>
                  </form>
                  <form action={rejectForInteraction} className="mt-1">
                    <input type="hidden" name="candidate_id" value={c.candidate_id} />
                    <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                      Reject
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-neutral-500">
                Decided ({decided.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {decided.map((c) => (
                  <li key={c.candidate_id} className="text-xs text-neutral-500">
                    [{c.status}] {CANDIDATE_LABELS[c.candidate_type]}: {c.statement}
                    {c.status === "Accepted" && (
                      <form action={revertForInteraction} className="inline">
                        <input type="hidden" name="candidate_id" value={c.candidate_id} />
                        <button type="submit" className="ml-2 underline">
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
              <button
                type="submit"
                className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Confirm &amp; continue to minutes
              </button>
            </form>
          )}
        </section>
      )}

      {interaction.processing_status === "Confirmed" && !minutes && (
        <form action={generateMinutesForInteraction} className="mt-8">
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Generate minutes of meeting
          </button>
        </form>
      )}

      {minutes && (
        <section className="mt-8 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium">
            Minutes of meeting — <span className="text-neutral-500">{minutes.status}</span>
          </h2>

          {(minutes.status === "Draft" || minutes.status === "InReview") && (
            <form action={updateMinutesForInteraction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="minutes_id" value={minutes.minutes_id} />
              <input
                name="subject"
                defaultValue={minutes.subject ?? ""}
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <textarea
                name="body_html"
                defaultValue={minutes.body_html ?? ""}
                rows={10}
                className="rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button
                type="submit"
                className="w-fit rounded-full border border-neutral-300 px-4 py-2 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Save edits
              </button>
            </form>
          )}

          {minutes.status !== "Draft" && minutes.status !== "InReview" && (
            <div
              className="prose prose-sm mt-3 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: minutes.body_html ?? "" }}
            />
          )}

          {minutes.status === "Draft" && userIsLead && recipientOptions.length > 0 && (
            <form action={approveForInteraction} className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <input type="hidden" name="minutes_id" value={minutes.minutes_id} />
              <p className="text-xs font-medium">Approve and distribute to:</p>
              {recipientOptions.map((r) => (
                <label key={r.email} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="recipients" value={r.email} defaultChecked />
                  {r.label} ({r.email})
                </label>
              ))}
              <button
                type="submit"
                className="mt-1 w-fit rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Approve &amp; distribute
              </button>
            </form>
          )}

          {minutes.status === "Distributed" && (
            <form action={disputeForInteraction} className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <input type="hidden" name="minutes_id" value={minutes.minutes_id} />
              <textarea
                name="dispute_note"
                placeholder="Dispute reason"
                rows={2}
                className="rounded-md border border-red-300 px-2 py-1 text-xs dark:border-red-800 dark:bg-neutral-900"
              />
              <button
                type="submit"
                className="w-fit rounded-full border border-red-300 px-4 py-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                Dispute minutes
              </button>
            </form>
          )}
        </section>
      )}

      {unmappedSpeakers.length > 0 && (members?.length || stakeholders?.length) ? (
        <div className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Unmapped speakers: {unmappedSpeakers.join(", ")}
          </h2>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Map each utterance below to a project member or stakeholder.
          </p>
        </div>
      ) : null}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium">Transcript ({utterances?.length ?? 0} utterances)</summary>
        <ul className="mt-3 flex flex-col gap-3">
          {utterances?.map((u) => (
            <li
              key={u.utterance_id}
              className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
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
              <p className="mt-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
                {u.content}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
