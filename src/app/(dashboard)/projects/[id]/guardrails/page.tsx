import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createGlossaryTerm,
  createGuardrailRule,
  deleteGlossaryTerm,
  deleteGuardrailRule,
  toggleGuardrailRule,
} from "./actions";
import { StoryChecker } from "./StoryChecker";

export const dynamic = "force-dynamic";

const RULE_TYPES = ["Vocabulary", "SentencePattern", "StructureCheck", "Completeness"];
const SEVERITIES = ["Info", "Warning", "Blocking"];

export default async function GuardrailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: glossary, error: glossaryError } = await supabase
    .from("glossary_term")
    .select("*")
    .eq("project_id", projectId)
    .order("term");

  const { data: rules, error: rulesError } = await supabase
    .from("guardrail_rule")
    .select("*")
    .eq("project_id", projectId)
    .order("rule_type");

  const createTermForProject = createGlossaryTerm.bind(null, projectId);
  const deleteTermForProject = deleteGlossaryTerm.bind(null, projectId);
  const createRuleForProject = createGuardrailRule.bind(null, projectId);
  const toggleRuleForProject = toggleGuardrailRule.bind(null, projectId);
  const deleteRuleForProject = deleteGuardrailRule.bind(null, projectId);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500 hover:underline">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Guardrails</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Project vocabulary, structure rules, and a checker to test a draft story against them.
      </p>

      {(glossaryError || rulesError) && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {glossaryError?.message ?? rulesError?.message}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Glossary</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {glossary?.map((g) => (
            <li
              key={g.term_id}
              className="flex items-start justify-between gap-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div>
                <p className="font-medium">{g.term}</p>
                {g.definition && <p className="text-xs text-neutral-500">{g.definition}</p>}
                {g.preferred_form && (
                  <p className="text-xs text-neutral-500">Preferred: {g.preferred_form}</p>
                )}
                {g.banned_forms && <p className="text-xs text-neutral-500">Banned: {g.banned_forms}</p>}
              </div>
              <form action={deleteTermForProject}>
                <input type="hidden" name="term_id" value={g.term_id} />
                <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500">Add term</summary>
          <form action={createTermForProject} className="mt-2 flex flex-col gap-2">
            <input
              name="term"
              placeholder="Term"
              required
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="definition"
              placeholder="Definition"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="preferred_form"
              placeholder="Preferred form"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="banned_forms"
              placeholder="Banned forms (comma-separated)"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="submit"
              className="w-fit rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Add
            </button>
          </form>
        </details>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Guardrail rules</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {rules?.map((r) => (
            <li
              key={r.rule_id}
              className="flex items-start justify-between gap-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div>
                <p className="font-medium">
                  {r.rule_name}{" "}
                  <span className="text-xs text-neutral-500">
                    ({r.rule_type} · {r.severity}){!r.is_active && " · inactive"}
                  </span>
                </p>
                {r.rule_expression && <p className="text-xs text-neutral-500">{r.rule_expression}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={toggleRuleForProject}>
                  <input type="hidden" name="rule_id" value={r.rule_id} />
                  <input type="hidden" name="is_active" value={String(r.is_active)} />
                  <button type="submit" className="text-xs hover:underline">
                    {r.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteRuleForProject}>
                  <input type="hidden" name="rule_id" value={r.rule_id} />
                  <button type="submit" className="text-xs text-red-700 hover:underline dark:text-red-300">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500">Add rule</summary>
          <form action={createRuleForProject} className="mt-2 flex flex-col gap-2">
            <select
              name="rule_type"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            >
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              name="rule_name"
              placeholder="Rule name"
              required
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="rule_expression"
              placeholder="Description of what the rule checks for"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
            <select
              name="severity"
              defaultValue="Warning"
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-fit rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Add
            </button>
          </form>
        </details>
      </section>

      <section className="mt-10 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Check a draft story</h2>
        <p className="mt-1 text-xs text-neutral-500">
          No story authoring UI exists yet (EPIC 11) — this tests the engine standalone against a
          pasted-in payload.
        </p>
        <div className="mt-4">
          <StoryChecker projectId={projectId} />
        </div>
      </section>
    </main>
  );
}
