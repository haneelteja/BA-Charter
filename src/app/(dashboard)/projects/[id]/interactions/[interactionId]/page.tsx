import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SpeakerMapSelect } from "./SpeakerMapSelect";

export const dynamic = "force-dynamic";

export default async function InteractionDetailPage({
  params,
}: {
  params: Promise<{ id: string; interactionId: string }>;
}) {
  const { id: projectId, interactionId } = await params;
  const supabase = await getSupabaseServerClient();

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
    ? await supabase.from("app_user").select("user_id, full_name").in("user_id", memberIds)
    : { data: [] };

  const { data: stakeholders } = await supabase
    .from("stakeholder")
    .select("stakeholder_id, full_name")
    .eq("project_id", projectId);

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

      {unmappedSpeakers.length > 0 && (members?.length || stakeholders?.length) ? (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Unmapped speakers: {unmappedSpeakers.join(", ")}
          </h2>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Map each utterance below to a project member or stakeholder.
          </p>
        </div>
      ) : null}

      <ul className="mt-8 flex flex-col gap-3">
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
    </main>
  );
}
