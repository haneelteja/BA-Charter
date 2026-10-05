import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** §4 Call preparation: pick a stakeholder, see every open clarification directed at them, grouped by topic (functional area), as a meeting agenda. */
export default async function CallPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ stakeholder_id?: string }>;
}) {
  const { stakeholder_id: stakeholderId } = await searchParams;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect("/sign-in");
  }

  const { data: stakeholders } = await supabase
    .from("stakeholder")
    .select("stakeholder_id, full_name, organisation, is_client_side, project:project_id(project_name)")
    .order("full_name");

  let groups: { topic: string; items: { clarification_id: string; question: string; why_it_matters: string | null; project_id: string }[] }[] = [];
  let selected: { full_name: string; organisation: string | null } | null = null;

  if (stakeholderId) {
    const { data: stakeholder } = await supabase
      .from("stakeholder")
      .select("full_name, organisation")
      .eq("stakeholder_id", stakeholderId)
      .maybeSingle();
    selected = stakeholder ?? null;

    const { data: clarifications } = await supabase
      .from("clarification")
      .select("clarification_id, question, why_it_matters, project_id, functional_area:functional_area_id(title)")
      .eq("audience_stakeholder_id", stakeholderId)
      .not("status", "in", "(Confirmed,Withdrawn)")
      .order("raised_at", { ascending: true });

    const byTopic = new Map<string, typeof groups[number]["items"]>();
    for (const c of clarifications ?? []) {
      const topic = (c.functional_area as unknown as { title: string } | null)?.title ?? "General";
      const list = byTopic.get(topic) ?? [];
      list.push({
        clarification_id: c.clarification_id,
        question: c.question,
        why_it_matters: c.why_it_matters,
        project_id: c.project_id,
      });
      byTopic.set(topic, list);
    }
    groups = [...byTopic.entries()].map(([topic, items]) => ({ topic, items }));
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/workspace" className="text-sm text-neutral-500 hover:underline">
        ← Workspace
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Call preparation</h1>

      <form method="GET" className="mt-6 flex items-center gap-2">
        <select
          name="stakeholder_id"
          defaultValue={stakeholderId ?? ""}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Select a stakeholder…</option>
          {(stakeholders ?? []).map((s) => (
            <option key={s.stakeholder_id} value={s.stakeholder_id}>
              {s.full_name}
              {s.organisation && ` (${s.organisation})`} —{" "}
              {(s.project as unknown as { project_name: string } | null)?.project_name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Prepare
        </button>
      </form>

      {selected && (
        <div className="mt-8">
          <h2 className="text-lg font-medium">
            Agenda for {selected.full_name}
            {selected.organisation && ` (${selected.organisation})`}
          </h2>

          {groups.length === 0 && <p className="mt-2 text-sm text-neutral-500">No open clarifications for this stakeholder.</p>}

          {groups.map((g) => (
            <section key={g.topic} className="mt-6">
              <h3 className="text-sm font-medium">{g.topic}</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {g.items.map((item) => (
                  <li key={item.clarification_id} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                    <Link href={`/projects/${item.project_id}/clarifications`} className="font-medium hover:underline">
                      {item.question}
                    </Link>
                    {item.why_it_matters && <p className="mt-1 text-xs text-neutral-500">{item.why_it_matters}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
