import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export interface GlossaryTerm {
  term: string;
  preferredForm: string | null;
  bannedForms: string | null;
}

export interface GuardrailRule {
  ruleType: "Vocabulary" | "SentencePattern" | "StructureCheck" | "Completeness";
  ruleName: string;
  ruleExpression: string | null;
  severity: "Info" | "Warning" | "Blocking";
}

export interface StoryPayload {
  title: string;
  actor: string | null;
  goal: string | null;
  businessValue: string | null;
  description: string | null;
  acceptanceCriteria: string | null;
}

const findingSchema = z.object({
  ruleType: z.enum(["Vocabulary", "SentencePattern", "StructureCheck", "Completeness"]),
  ruleName: z.string(),
  severity: z.enum(["Info", "Warning", "Blocking"]),
  fieldName: z.string().nullable(),
  message: z.string(),
  suggestedCorrection: z.string().nullable(),
});

export type GuardrailFinding = z.infer<typeof findingSchema>;

/** Banned-term scanning is exact string matching, not LLM judgement — more reliable and doesn't need a model call. */
function checkVocabulary(payload: StoryPayload, glossary: GlossaryTerm[]): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  const fields: [string, string | null][] = [
    ["title", payload.title],
    ["goal", payload.goal],
    ["description", payload.description],
  ];

  for (const term of glossary) {
    const banned = (term.bannedForms ?? "")
      .split(",")
      .map((b) => b.trim().toLowerCase())
      .filter(Boolean);
    if (banned.length === 0) continue;

    for (const [fieldName, value] of fields) {
      if (!value) continue;
      const lower = value.toLowerCase();
      const hit = banned.find((b) => lower.includes(b));
      if (hit) {
        findings.push({
          ruleType: "Vocabulary",
          ruleName: `Banned term: ${term.term}`,
          severity: "Warning",
          fieldName,
          message: `"${hit}" is a banned form of "${term.term}".`,
          suggestedCorrection: term.preferredForm
            ? `Use "${term.preferredForm}" instead.`
            : null,
        });
      }
    }
  }

  return findings;
}

/**
 * §3.6 stage 3: SentencePattern, StructureCheck and the explicit
 * completeness sub-checks (negative paths, error handling, permissions,
 * data migration) all need judgement a string match can't give —
 * evaluated in one LLM call against the project's active rules.
 */
async function checkWithModel(
  model: LanguageModel,
  payload: StoryPayload,
  rules: GuardrailRule[]
): Promise<GuardrailFinding[]> {
  const nonVocabRules = rules.filter((r) => r.ruleType !== "Vocabulary");

  const { object } = await generateObject({
    model,
    schema: z.object({ findings: z.array(findingSchema) }),
    maxOutputTokens: 2048,
    prompt: `You are reviewing a draft user story against a project's guardrail rules.

Story:
- Title: ${payload.title}
- Actor: ${payload.actor ?? "(not set)"}
- Goal: ${payload.goal ?? "(not set)"}
- Business value: ${payload.businessValue ?? "(not set)"}
- Description: ${payload.description ?? "(not set)"}
- Acceptance criteria: ${payload.acceptanceCriteria ?? "(not set)"}

Active project rules:
${nonVocabRules.length > 0 ? nonVocabRules.map((r) => `- [${r.ruleType}/${r.severity}] ${r.ruleName}: ${r.ruleExpression ?? "(no expression given)"}`).join("\n") : "(none configured)"}

Always also check completeness regardless of configured rules, per the standard checklist: negative paths, error handling, permissions, and data migration. Report a Completeness finding (severity Warning unless clearly critical) for anything missing from the story above.

For each issue found, report ruleType, the matching ruleName (or a descriptive name for completeness gaps), severity, which field it concerns (fieldName, or null if story-wide), a message explaining the issue, and suggestedCorrection if you have one. Report nothing for aspects that are adequately covered.`,
  });

  return object.findings;
}

export async function evaluateGuardrails(
  model: LanguageModel,
  payload: StoryPayload,
  glossary: GlossaryTerm[],
  rules: GuardrailRule[]
): Promise<GuardrailFinding[]> {
  const vocabFindings = checkVocabulary(payload, glossary);
  const modelFindings = await checkWithModel(model, payload, rules);
  return [...vocabFindings, ...modelFindings];
}
