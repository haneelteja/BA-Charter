import { afterEach, describe, expect, it, vi } from "vitest";

const enqueueJob = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/jobs/enqueue", () => ({ enqueueJob }));

const { enqueueBackfillEmbeddings } = await import("./embeddingBackfill");

/**
 * A minimal fake query builder: `.from(table)` returns a chain whose
 * `.select()/.eq()/.is()` calls just record the query before eventually
 * resolving (the chain is "thenable" so `await` on it works) to
 * `tableData[table]`, and whose `.eq("interaction.project_id", ...)` is
 * what the utterance branch's embedded-resource filter uses — same mock
 * handles both the direct-table and the joined-utterance shape.
 */
function fakeSupabase(tableData: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: tableData[table] ?? [] }),
      };
      return builder;
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("enqueueBackfillEmbeddings", () => {
  it("enqueues every embeddable row missing an embedding, across all 9 direct tables plus utterance", async () => {
    const supabase = fakeSupabase({
      decision: [{ decision_id: "d1" }],
      knowledge_node: [{ knowledge_node_id: "k1" }],
      user_story: [],
      epic: [{ epic_id: "e1" }],
      action_item: [],
      clarification: [],
      change_request: [],
      guardrail_rule: [],
      project_document: [{ document_id: "doc1" }],
      utterance: [{ utterance_id: "u1" }, { utterance_id: "u2" }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await enqueueBackfillEmbeddings(supabase as any, "project-1", "user-1");

    expect(count).toBe(6);
    expect(enqueueJob).toHaveBeenCalledWith("embed_object", {
      projectId: "project-1",
      objectType: "Decision",
      objectId: "d1",
      userId: "user-1",
    });
    expect(enqueueJob).toHaveBeenCalledWith("embed_object", {
      projectId: "project-1",
      objectType: "Epic",
      objectId: "e1",
      userId: "user-1",
    });
    expect(enqueueJob).toHaveBeenCalledWith("embed_object", {
      projectId: "project-1",
      objectType: "Document",
      objectId: "doc1",
      userId: "user-1",
    });
    expect(enqueueJob).toHaveBeenCalledWith("embed_object", {
      projectId: "project-1",
      objectType: "Utterance",
      objectId: "u1",
      userId: "user-1",
    });
    expect(enqueueJob).toHaveBeenCalledWith("embed_object", {
      projectId: "project-1",
      objectType: "Utterance",
      objectId: "u2",
      userId: "user-1",
    });
  });

  it("enqueues nothing when every table already has every row embedded", async () => {
    const supabase = fakeSupabase({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await enqueueBackfillEmbeddings(supabase as any, "project-1", "user-1");
    expect(count).toBe(0);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
