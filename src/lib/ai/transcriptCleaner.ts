import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

const cleanedTranscriptSchema = z.object({
  utterances: z.array(
    z.object({
      speakerLabel: z.string().nullable(),
      content: z.string(),
    })
  ),
});

export interface CleanedUtterance {
  speakerLabel: string | null;
  content: string;
}

export interface CleanTranscriptInput {
  model: LanguageModel;
  rawText: string;
}

/**
 * `parseUtterances` (src/lib/transcript/parse.ts) assumes a transcript is
 * already clean — any line that isn't "Speaker: text" just gets appended as
 * a continuation of the previous line. A raw paste straight out of a chat
 * app's UI (channel lists, "Has context menu", reaction-count summaries,
 * repeated preview snippets, quoted-reply chrome, etc.) breaks that
 * assumption badly, so this runs an LLM pass first to pull out only the
 * genuine messages before they ever reach the naive parser.
 */
export async function cleanTranscript(input: CleanTranscriptInput): Promise<CleanedUtterance[]> {
  const { object } = await generateObject({
    model: input.model,
    schema: cleanedTranscriptSchema,
    maxOutputTokens: 4096,
    prompt: `The text below was pasted directly out of a chat or meeting app's UI (e.g. Microsoft Teams). It mixes real messages people sent with interface chrome that got scraped along with it.

Raw paste:
${input.rawText}

Extract only the genuine messages, in their original order:
- Drop interface chrome entirely: navigation/channel/folder labels, button and menu text ("Has context menu", "Join", "Unread", "See more"), reaction-count summaries ("👍 1 Like reaction"), attachment/file chrome, and system lines like "Meeting started/ended at ...".
- Where a sender name, timestamp, and message body appear as separate lines for the same message, merge them into one utterance: speakerLabel is the sender's name (or null if it truly can't be determined), content is the message text only (no repeated timestamp).
- When a message quotes or replies to an earlier one ("Begin quote, <name>, <date> ... <quoted text>"), keep only the new reply content — drop the repeated quoted text, since the original already appears earlier in the output.
- If a preview snippet is immediately followed by the same message in full, keep only the full version.
- If nothing resembling real conversation content is present, return an empty utterances array rather than guessing.`,
  });

  return object.utterances;
}
