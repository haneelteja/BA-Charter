import type { RetrievalResult } from "./search";

/**
 * The only part shape this app's chat ever produces or persists — plain
 * text turns, no tool calls/reasoning/files. Kept narrower than the AI
 * SDK's full `UIMessagePart` union on purpose: widen it (and
 * `extractMessageText`) if a future feature actually needs another part
 * type, rather than accepting a shape nothing here uses yet.
 */
export interface ChatTextPart {
  type: "text";
  text: string;
}

export interface ChatUIMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatTextPart[];
}

export interface StoredChatMessageRow {
  chat_message_id: string;
  role: "user" | "assistant";
  parts: unknown;
}

/** Converts `project_chat_message` rows (oldest first) into the UIMessage[] shape `convertToModelMessages`/`toUIMessageStream` expect. */
export function dbRowsToUIMessages(rows: StoredChatMessageRow[]): ChatUIMessage[] {
  return rows.map((row) => ({
    id: row.chat_message_id,
    role: row.role,
    parts: Array.isArray(row.parts) ? (row.parts as ChatTextPart[]).filter((p) => p?.type === "text") : [],
  }));
}

/** Flattens a message's text parts into one string — e.g. to use as the retrieval query. */
export function extractMessageText(message: Pick<ChatUIMessage, "parts">): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

const SYSTEM_PREAMBLE =
  "You are the project assistant for this Business Analyst workspace. Answer the user's " +
  "question using ONLY the project context below, which was retrieved from this specific " +
  "project's charter, interactions, epics, stories, clarifications, action items, change " +
  "requests, guardrails, and uploaded documents. If the context doesn't cover something, say " +
  "so plainly rather than guessing or using outside knowledge. Be concise, and mention which " +
  "kind of content an answer is drawn from when it's helpful (e.g. \"Per a Decision:\" or " +
  "\"From the Charter:\").";

/** Builds the system instructions for one turn from this turn's retrieval results. */
export function buildRagInstructions(results: RetrievalResult[]): string {
  if (results.length === 0) {
    return `${SYSTEM_PREAMBLE}\n\nProject context: (nothing relevant was found in the project for this question — say so rather than guessing.)`;
  }

  const context = results.map((r) => `[${r.object_type}] ${r.snippet}`).join("\n");
  return `${SYSTEM_PREAMBLE}\n\nProject context:\n${context}`;
}
