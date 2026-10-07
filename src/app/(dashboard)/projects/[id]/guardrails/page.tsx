import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createGlossaryTerm,
  createGuardrailRule,
  deleteGlossaryTerm,
  deleteGuardrailRule,
  toggleGuardrailRule,
} from "./actions";
import { StoryChecker } from "./StoryChecker";
import { BackLink, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href={`/projects/${projectId}`}>Back to project</BackLink>
      <PageHeader
        title="Guardrails"
        subtitle="Project vocabulary, structure rules, and a checker to test a draft story against them."
      />

      {(glossaryError || rulesError) && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {glossaryError?.message ?? rulesError?.message}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Glossary</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {glossary?.map((g) => (
            <li key={g.term_id}>
              <Card className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{g.term}</p>
                  {g.definition && <p className="text-xs text-muted">{g.definition}</p>}
                  {g.preferred_form && <p className="text-xs text-muted">Preferred: {g.preferred_form}</p>}
                  {g.banned_forms && <p className="text-xs text-muted">Banned: {g.banned_forms}</p>}
                </div>
                <form action={deleteTermForProject}>
                  <input type="hidden" name="term_id" value={g.term_id} />
                  <button type="submit" className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400">
                    Delete
                  </button>
                </form>
              </Card>
            </li>
          ))}
        </ul>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            + Add term
          </summary>
          <Card className="mt-3">
            <form action={createTermForProject} className="flex flex-col gap-2">
              <Field label="Term" htmlFor="term">
                <Input id="term" name="term" placeholder="Term" required />
              </Field>
              <Field label="Definition" htmlFor="definition">
                <Input id="definition" name="definition" placeholder="Definition" />
              </Field>
              <Field label="Preferred form" htmlFor="preferred_form">
                <Input id="preferred_form" name="preferred_form" placeholder="Preferred form" />
              </Field>
              <Field label="Banned forms" htmlFor="banned_forms">
                <Input id="banned_forms" name="banned_forms" placeholder="Banned forms (comma-separated)" />
              </Field>
              <Button type="submit" size="sm" className="w-fit">
                Add
              </Button>
            </form>
          </Card>
        </details>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Guardrail rules</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {rules?.map((r) => (
            <li key={r.rule_id}>
              <Card className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {r.rule_name}{" "}
                    <span className="text-xs text-muted">
                      ({r.rule_type} · {r.severity}){!r.is_active && " · inactive"}
                    </span>
                  </p>
                  {r.rule_expression && <p className="text-xs text-muted">{r.rule_expression}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={toggleRuleForProject}>
                    <input type="hidden" name="rule_id" value={r.rule_id} />
                    <input type="hidden" name="is_active" value={String(r.is_active)} />
                    <button type="submit" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  <form action={deleteRuleForProject}>
                    <input type="hidden" name="rule_id" value={r.rule_id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                      Delete
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            + Add rule
          </summary>
          <Card className="mt-3">
            <form action={createRuleForProject} className="flex flex-col gap-2">
              <Field label="Rule type" htmlFor="rule_type">
                <Select id="rule_type" name="rule_type">
                  {RULE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rule name" htmlFor="rule_name">
                <Input id="rule_name" name="rule_name" placeholder="Rule name" required />
              </Field>
              <Field label="Description" htmlFor="rule_expression">
                <Input id="rule_expression" name="rule_expression" placeholder="Description of what the rule checks for" />
              </Field>
              <Field label="Severity" htmlFor="severity">
                <Select id="severity" name="severity" defaultValue="Warning">
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" size="sm" className="w-fit">
                Add
              </Button>
            </form>
          </Card>
        </details>
      </section>

      <section className="mt-10 border-t border-surface-border pt-8">
        <h2 className="text-sm font-semibold">Check a draft story</h2>
        <p className="mt-1 text-xs text-muted">
          Tests the guardrail engine standalone against a pasted-in payload — useful for tuning rules without
          editing a real story. For an actual draft, use the Check panel on the story&apos;s own page instead.
        </p>
        <div className="mt-4">
          <StoryChecker projectId={projectId} />
        </div>
      </section>
    </main>
  );
}
