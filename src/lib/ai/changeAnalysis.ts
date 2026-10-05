import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

export interface ChangeContextItem {
  objectType: string;
  objectId: string;
  snippet: string;
}

const gapFindingSchema = z.object({
  findingType: z.enum(["Undefined", "Contradiction"]),
  detail: z.string(),
  confidenceScore: z.number().min(0).max(1).nullable(),
});

export type GapFinding = z.infer<typeof gapFindingSchema>;

/**
 * EPIC 12 Analyse stage, gap/contradiction half (the "Affected" half comes
 * from EPIC 10 retrieval directly, not an LLM call — see runChangeImpactAnalysis
 * in changes/actions.ts). Deliberately doesn't ask the model for a target
 * object id: it would have to invent one, since nothing here guarantees the
 * id it names is real. Gaps/contradictions are recorded project-wide
 * (target_object_type/id left null) rather than risk a hallucinated FK.
 */
export async function identifyGapsAndContradictions(
  model: LanguageModel,
  changeDescription: string,
  context: ChangeContextItem[]
): Promise<GapFinding[]> {
  const { object } = await generateObject({
    model,
    schema: z.object({ findings: z.array(gapFindingSchema) }),
    maxOutputTokens: 2048,
    prompt: `You are analysing the impact of a proposed change request against a project's existing requirements.

Change request:
${changeDescription}

Existing related content (decisions, charter entries, published stories) found via retrieval:
${context.length > 0 ? context.map((c) => `- [${c.objectType}] ${c.snippet}`).join("\n") : "(no related content found)"}

Identify two kinds of issues:
1. "Undefined" gaps the change introduces or exposes — missing acceptance criteria, unspecified error paths, absent non-functional requirements, undefined permissions, absent data migration handling.
2. "Contradiction" — specific conflicts between what the change requests and what the existing content above says, citing both sides in the detail text.

Only report real issues grounded in the text given. Return nothing if there's genuinely nothing to flag.`,
  });

  return object.findings;
}

const brainstormQuestionSchema = z.object({
  question: z.string(),
  audience: z.enum(["Client", "Architect", "InternalBusiness", "DeliveryTeam"]),
  priority: z.enum(["High", "Medium", "Low"]),
  rationale: z.string(),
});

export type BrainstormQuestion = z.infer<typeof brainstormQuestionSchema>;

/** EPIC 12 Brainstorm stage: turns undisposed impact findings into a question list a BA edits before raising any as Clarification Item cases. */
export async function generateBrainstormQuestions(
  model: LanguageModel,
  changeDescription: string,
  findings: { findingType: string; detail: string }[]
): Promise<BrainstormQuestion[]> {
  const { object } = await generateObject({
    model,
    schema: z.object({ questions: z.array(brainstormQuestionSchema) }),
    maxOutputTokens: 2048,
    prompt: `You are preparing a prioritised, audience-grouped list of clarifying questions for a change request, based on gaps and contradictions already identified.

Change request:
${changeDescription}

Open findings:
${findings.length > 0 ? findings.map((f) => `- [${f.findingType}] ${f.detail}`).join("\n") : "(none recorded — ask whatever is needed to scope the change)"}

For each question, say who it should be directed at (Client, Architect, InternalBusiness, or DeliveryTeam), how urgent an answer is (High/Medium/Low), and why it matters. Keep the list focused — one question per distinct open point, not a question per finding if several findings share the same root question.`,
  });

  return object.questions;
}

const proposedChangeSchema = z.object({
  fieldName: z.string(),
  currentValue: z.string().nullable(),
  proposedValue: z.string(),
  rationale: z.string(),
});

export type ProposedChange = z.infer<typeof proposedChangeSchema>;

/**
 * EPIC 12 Propagate stage: drafts edits to one affected epic/story for a BA
 * to approve individually (§8 rule 6/7 still apply downstream — this never
 * touches Agile Studio-owned fields like sprint/points, only the same
 * description-shaped fields a BA would edit directly).
 */
export async function generateProposedEdits(
  model: LanguageModel,
  changeDescription: string,
  target: { objectType: "Epic" | "UserStory"; currentFields: Record<string, string | null> }
): Promise<ProposedChange[]> {
  const { object } = await generateObject({
    model,
    schema: z.object({ changes: z.array(proposedChangeSchema) }),
    maxOutputTokens: 2048,
    prompt: `A change request requires updating an existing ${target.objectType === "Epic" ? "epic" : "user story"}. Draft the specific field edits needed.

Change request:
${changeDescription}

Current ${target.objectType} fields:
${Object.entries(target.currentFields)
  .map(([k, v]) => `- ${k}: ${v ?? "(empty)"}`)
  .join("\n")}

For each field that needs to change, give the field name (must match one of the names listed above exactly), the current value, the proposed new value (the full replacement text, not a diff), and a short rationale tying it back to the change request. Only propose changes that are actually necessary — don't rewrite fields the change doesn't affect.`,
  });

  return object.changes;
}
