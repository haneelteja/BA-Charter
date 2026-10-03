import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isOlderThanDays } from "@/lib/dates";
import { answerClarification, confirmAnswer, markAsked, markPrepared, withdrawClarification } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_ORDER = ["Raised", "Prepared", "Asked", "Answered", "Confirmed", "Withdrawn"];

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
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Clarifications</h1>
      <p className="mt-1 text-sm text-neutral-500">Ageing threshold: {ageingDays} days unanswered.</p>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error.message}
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const group = (clarifications ?? []).filter((c) => c.status === status);
        if (group.length === 0) return null;

        return (
          <section key={status} className="mt-6">
            <h2 className="text-sm font-medium">
              {status} ({group.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-3">
              {group.map((c) => {
                const isAgeing =
                  ["Raised", "Prepared", "Asked"].includes(c.status) &&
                  isOlderThanDays(c.raised_at, ageingDays);

                return (
                  <li
                    key={c.clarification_id}
                    className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{c.question}</p>
                      {isAgeing && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          Ageing
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Chasing: {chaserName(c.chasing_user_id)} · Audience: {c.audience_type}
                    </p>
                    {c.answer_text && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Answer ({c.answered_by}): {c.answer_text}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {c.status === "Raised" && (
                        <form action={prepareForProject}>
                          <input type="hidden" name="clarification_id" value={c.clarification_id} />
                          <button
                            type="submit"
                            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            Mark prepared
                          </button>
                        </form>
                      )}
                      {(c.status === "Raised" || c.status === "Prepared") && (
                        <form action={askForProject} className="flex items-center gap-1">
                          <input type="hidden" name="clarification_id" value={c.clarification_id} />
                          <input
                            name="asked_channel"
                            placeholder="Channel"
                            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <input
                            name="asked_on"
                            type="date"
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <button
                            type="submit"
                            className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            Mark asked
                          </button>
                        </form>
                      )}
                      {c.status === "Asked" && (
                        <form action={answerForProject} className="flex flex-col gap-1">
                          <input type="hidden" name="clarification_id" value={c.clarification_id} />
                          <input
                            name="answer_text"
                            placeholder="Answer"
                            required
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <input
                            name="answered_by"
                            placeholder="Answered by"
                            required
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <button
                            type="submit"
                            className="w-fit rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            Record answer
                          </button>
                        </form>
                      )}
                      {c.status === "Answered" && (
                        <form action={confirmForProject}>
                          <input type="hidden" name="clarification_id" value={c.clarification_id} />
                          <button
                            type="submit"
                            className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                          >
                            Confirm answer
                          </button>
                        </form>
                      )}
                      {!["Confirmed", "Withdrawn"].includes(c.status) && (
                        <form action={withdrawForProject}>
                          <input type="hidden" name="clarification_id" value={c.clarification_id} />
                          <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                            Withdraw
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {!error && (clarifications ?? []).length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">No clarifications yet.</p>
      )}
    </main>
  );
}
