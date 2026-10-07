import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isOlderThanDays } from "@/lib/dates";
import { answerClarification, confirmAnswer, markAsked, markPrepared, withdrawClarification } from "./actions";
import { BackLink, Badge, Button, Card, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["Raised", "Prepared", "Asked", "Answered", "Confirmed", "Withdrawn"];
const STATUS_TONE: Record<string, "indigo" | "amber" | "green" | "neutral"> = {
  Raised: "indigo",
  Prepared: "indigo",
  Asked: "amber",
  Answered: "amber",
  Confirmed: "green",
  Withdrawn: "neutral",
};

export default async function ClarificationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: clarifications, error } = await supabase
    .from("clarification")
    .select("*")
    .eq("project_id", projectId)
    .order("raised_at", { ascending: false });

  const chaserIds = Array.from(new Set((clarifications ?? []).map((c) => c.chasing_user_id).filter(Boolean)));
  const { data: chasers } = chaserIds.length
    ? await supabase.from("app_user").select("user_id, full_name").in("user_id", chaserIds as string[])
    : { data: [] };
  const chaserName = (id: string | null) => (chasers ?? []).find((c) => c.user_id === id)?.full_name ?? "Unassigned";

  const { data: project } = await supabase
    .from("project")
    .select("clarification_ageing_days")
    .eq("project_id", projectId)
    .single();
  const ageingDays = project?.clarification_ageing_days ?? 14;

  const prepareForProject = markPrepared.bind(null, projectId);
  const askForProject = markAsked.bind(null, projectId);
  const answerForProject = answerClarification.bind(null, projectId);
  const confirmForProject = confirmAnswer.bind(null, projectId);
  const withdrawForProject = withdrawClarification.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader title="Clarifications" subtitle={`Ageing threshold: ${ageingDays} days unanswered.`} />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const group = (clarifications ?? []).filter((c) => c.status === status);
        if (group.length === 0) return null;

        return (
          <section key={status} className="mt-8">
            <h2 className="text-sm font-semibold">
              {status} ({group.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {group.map((c) => {
                const isAgeing =
                  ["Raised", "Prepared", "Asked"].includes(c.status) &&
                  isOlderThanDays(c.raised_at, ageingDays);

                return (
                  <li key={c.clarification_id}>
                    <Card>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{c.question}</p>
                        <div className="flex shrink-0 gap-1.5">
                          <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                          {isAgeing && <Badge tone="amber">Ageing</Badge>}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Chasing: {chaserName(c.chasing_user_id)} · Audience: {c.audience_type}
                      </p>
                      {c.answer_text && (
                        <p className="mt-1 text-xs text-muted">
                          Answer ({c.answered_by}): {c.answer_text}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {c.status === "Raised" && (
                          <form action={prepareForProject}>
                            <input type="hidden" name="clarification_id" value={c.clarification_id} />
                            <Button type="submit" size="sm">
                              Mark prepared
                            </Button>
                          </form>
                        )}
                        {(c.status === "Raised" || c.status === "Prepared") && (
                          <form action={askForProject} className="flex items-center gap-1.5">
                            <input type="hidden" name="clarification_id" value={c.clarification_id} />
                            <Input name="asked_channel" placeholder="Channel" className="h-8 w-20 py-1 text-xs" />
                            <Input name="asked_on" type="date" className="h-8 py-1 text-xs" />
                            <Button type="submit" size="sm">
                              Mark asked
                            </Button>
                          </form>
                        )}
                        {c.status === "Asked" && (
                          <form action={answerForProject} className="flex flex-col gap-1.5">
                            <input type="hidden" name="clarification_id" value={c.clarification_id} />
                            <Input name="answer_text" placeholder="Answer" required className="h-8 py-1 text-xs" />
                            <Input name="answered_by" placeholder="Answered by" required className="h-8 py-1 text-xs" />
                            <Button type="submit" size="sm" className="w-fit">
                              Record answer
                            </Button>
                          </form>
                        )}
                        {c.status === "Answered" && (
                          <form action={confirmForProject}>
                            <input type="hidden" name="clarification_id" value={c.clarification_id} />
                            <Button type="submit" variant="primary" size="sm">
                              Confirm answer
                            </Button>
                          </form>
                        )}
                        {!["Confirmed", "Withdrawn"].includes(c.status) && (
                          <form action={withdrawForProject}>
                            <input type="hidden" name="clarification_id" value={c.clarification_id} />
                            <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                              Withdraw
                            </button>
                          </form>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!error && (clarifications ?? []).length === 0 && (
        <Card className="mt-6 text-sm text-muted">No clarifications yet.</Card>
      )}
    </main>
  );
}
