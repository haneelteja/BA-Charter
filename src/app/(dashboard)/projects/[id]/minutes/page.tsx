import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral" | "red"> = {
  Draft: "neutral",
  InReview: "amber",
  Approved: "indigo",
  Distributed: "green",
  Disputed: "red",
};

export default async function MinutesOfMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: minutes, error } = await supabase
    .from("minutes_document")
    .select("minutes_id, interaction_id, subject, status, created_at, distributed_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const interactionIds = Array.from(new Set((minutes ?? []).map((m) => m.interaction_id)));
  const { data: interactions } = interactionIds.length
    ? await supabase.from("interaction").select("interaction_id, title").in("interaction_id", interactionIds)
    : { data: [] };
  const interactionTitle = (id: string) => (interactions ?? []).find((i) => i.interaction_id === id)?.title;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <PageHeader title="Minutes of meetings" subtitle="Generated, approved, and distributed meeting records" />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {minutes?.map((m) => {
          const title = interactionTitle(m.interaction_id);
          return (
            <li key={m.minutes_id}>
              <Link href={`/projects/${projectId}/interactions/${m.interaction_id}`}>
                <Card className="transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{m.subject || title || "Untitled minutes"}</p>
                    <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {title && `From ${title} · `}
                    Created {new Date(m.created_at).toLocaleDateString()}
                    {m.distributed_at && ` · Distributed ${new Date(m.distributed_at).toLocaleDateString()}`}
                  </p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
      {!error && (minutes ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No minutes generated yet.</Card>
      )}
    </main>
  );
}
