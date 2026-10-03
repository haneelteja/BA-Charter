import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

// OpenAI's strict structured-output mode requires every object property to
// appear in the schema's "required" array — there is no true optional
// field, only nullable ones. zod's `.optional()` drops a key from
// `required` when converted to JSON Schema, which OpenAI then rejects
// outright ("Missing 'suggestedOwner'"). Every maybe-absent field below is
// `.nullable()` only — the model returns `null`, never an omitted key.
const candidateItem = z.object({
  statement: z.string(),
  suggestedOwner: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1),
  sourceUtteranceSequenceNo: z.number().int().nullable(),
});

const extractionSchema = z.object({
  decisions: z.array(
    candidateItem.extend({
      contradictsExistingDecisionId: z.string().nullable(),
      contradictionExplanation: z.string().nullable(),
    })
  ),
  actionItems: z.array(
    candidateItem.extend({
      suggestedDueDate: z.string().nullable(),
    })
  ),
  clarifications: z.array(candidateItem),
  risks: z.array(candidateItem),
  changeSignals: z.array(candidateItem),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

export interface ExtractionInput {
  model: LanguageModel;
  utterances: { sequenceNo: number; speakerLabel: string | null; content: string }[];
  existingConfirmedDecisions: { decisionId: string; statement: string }[];
}

/**
 * One call produces every candidate type at once (§3.2 stage 2: "candidate
 * decisions, action items, open questions, risks and change signals") plus
 * contradiction flags against currently-confirmed decisions
 * (includeContradictionCheck in ba-workbench-integrations.yaml) — there's no
 * retrieval/embedding service yet (EPIC 10, Phase 4), so the model is given
 * the existing confirmed statements directly in context instead of a
 * semantic search step.
 */
export async function extractCandidates(input: ExtractionInput): Promise<ExtractionResult> {
  const transcript = input.utterances
    .map((u) => `[${u.sequenceNo}] ${u.speakerLabel ?? "Unknown"}: ${u.content}`)
    .join("\n");

  const existingDecisionsBlock =
    input.existingConfirmedDecisions.length > 0
      ? input.existingConfirmedDecisions
          .map((d) => `- (${d.decisionId}) ${d.statement}`)
          .join("\n")
      : "(none recorded yet)";

  const { object } = await generateObject({
    model: input.model,
    schema: extractionSchema,
    maxOutputTokens: 4096,
    prompt: `You are a business analyst assistant extracting structured content from a meeting transcript.

Existing confirmed project decisions:
${existingDecisionsBlock}

Transcript (each line tagged with its utterance sequence number):
${transcript}

Extract:
- decisions: firm statements of intent or agreement. If a decision contradicts one of the existing confirmed decisions listed above, set contradictsExistingDecisionId to that decision's id and explain why in contradictionExplanation.
- actionItems: concrete tasks someone committed to, with suggestedDueDate (ISO date) if one was stated.
- clarifications: open questions that were raised but not answered.
- risks: concerns or threats to the project raised in discussion.
- changeSignals: statements suggesting a change to previously agreed scope or requirements.

For every item, set sourceUtteranceSequenceNo to the bracketed number of the line it came from, and confidenceScore (0 to 1) reflecting how clearly the transcript supports it. Only extract what is actually present — return empty arrays for categories with nothing to report.`,
  });

  return object;
}
