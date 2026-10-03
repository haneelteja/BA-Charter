import { generateText, type LanguageModel } from "ai";

export interface MinutesInput {
  model: LanguageModel;
  interactionTitle: string | null;
  decisions: string[];
  actionItems: string[];
  clarifications: string[];
}

export interface MinutesDraft {
  subject: string;
  bodyHtml: string;
}

/**
 * §3.2 stage 4: "Generate minutes of meeting from confirmed content only" —
 * the caller passes only Accepted-candidate statements, never Pending or
 * Rejected ones, so there is no path for unconfirmed content to reach this
 * prompt.
 */
export async function generateMinutesDraft(input: MinutesInput): Promise<MinutesDraft> {
  const section = (label: string, items: string[]) =>
    items.length > 0
      ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}`
      : `${label}: none`;

  const { text } = await generateText({
    model: input.model,
    maxOutputTokens: 2048,
    prompt: `Write minutes of meeting as clean HTML (use <h2>, <ul>, <li>, <p> — no <html>/<body> wrapper) for a meeting titled "${
      input.interactionTitle ?? "Untitled meeting"
    }".

${section("Decisions", input.decisions)}

${section("Action items", input.actionItems)}

${section("Open questions", input.clarifications)}

Keep it factual and concise. Do not invent content beyond what's listed above.`,
  });

  return {
    subject: `Minutes of meeting: ${input.interactionTitle ?? "Untitled meeting"}`,
    bodyHtml: text,
  };
}
