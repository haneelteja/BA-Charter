import { describe, expect, it } from "vitest";
import { buildRagInstructions, dbRowsToUIMessages, extractMessageText } from "./projectChat";
import type { RetrievalResult } from "./search";

describe("dbRowsToUIMessages", () => {
  it("maps rows to UIMessages, keyed by chat_message_id", () => {
    const rows = [
      { chat_message_id: "m1", role: "user" as const, parts: [{ type: "text", text: "hi" }] },
      { chat_message_id: "m2", role: "assistant" as const, parts: [{ type: "text", text: "hello" }] },
    ];

    expect(dbRowsToUIMessages(rows)).toEqual([
      { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "hello" }] },
    ]);
  });

  it("drops non-text parts and tolerates malformed parts data", () => {
    const rows = [
      { chat_message_id: "m1", role: "user" as const, parts: [{ type: "tool-call", foo: "bar" }, { type: "text", text: "ok" }] },
      { chat_message_id: "m2", role: "assistant" as const, parts: "not an array" },
    ];

    const result = dbRowsToUIMessages(rows);
    expect(result[0].parts).toEqual([{ type: "text", text: "ok" }]);
    expect(result[1].parts).toEqual([]);
  });
});

describe("extractMessageText", () => {
  it("joins multiple text parts with a newline", () => {
    const text = extractMessageText({
      parts: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    });
    expect(text).toBe("first\nsecond");
  });

  it("trims surrounding whitespace", () => {
    expect(extractMessageText({ parts: [{ type: "text", text: "  padded  " }] })).toBe("padded");
  });

  it("returns an empty string for a message with no text parts", () => {
    expect(extractMessageText({ parts: [] })).toBe("");
  });
});

describe("buildRagInstructions", () => {
  it("includes a snippet per retrieval result, labeled by object type", () => {
    const results: RetrievalResult[] = [
      { object_type: "Decision", object_id: "d1", snippet: "We will use OAuth2.", relevance_score: 0.9, source_utterance_id: null },
      { object_type: "Epic", object_id: "e1", snippet: "Self-service onboarding.", relevance_score: 0.8, source_utterance_id: null },
    ];

    const instructions = buildRagInstructions(results);
    expect(instructions).toContain("[Decision] We will use OAuth2.");
    expect(instructions).toContain("[Epic] Self-service onboarding.");
  });

  it("tells the model nothing relevant was found when there are no results", () => {
    const instructions = buildRagInstructions([]);
    expect(instructions).toContain("nothing relevant was found");
  });
});
