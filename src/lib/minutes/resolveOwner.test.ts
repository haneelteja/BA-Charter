import { describe, expect, it } from "vitest";
import { resolveOwnerUserId } from "./resolveOwner";

/**
 * A minimal fake query builder matching the one pattern established in
 * embeddingBackfill.test.ts: `.from(table)` returns a chain whose
 * `.select()/.eq()/.in()/.ilike()` calls just record the query before
 * eventually resolving (the chain is "thenable" so `await` on it works).
 */
function fakeSupabase({
  members,
  matches,
}: {
  members: { user_id: string }[];
  matches: { user_id: string; full_name: string }[];
}) {
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        ilike: () => builder,
        then: (resolve: (v: { data: unknown[] }) => void) =>
          resolve({ data: table === "project_member" ? members : matches }),
      };
      return builder;
    },
  };
}

describe("resolveOwnerUserId", () => {
  it("prefers an explicitly resolved owner over everything else, without even querying", async () => {
    const supabase = fakeSupabase({ members: [], matches: [] });
    const result = await resolveOwnerUserId(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      "project-1",
      "explicit-user",
      "Someone Else",
      "lead-user"
    );
    expect(result).toBe("explicit-user");
  });

  it("falls back to an exact case-insensitive name match when left unassigned", async () => {
    const supabase = fakeSupabase({
      members: [{ user_id: "member-1" }],
      matches: [{ user_id: "member-1", full_name: "Jordan Rivers" }],
    });
    const result = await resolveOwnerUserId(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      "project-1",
      null,
      "jordan rivers",
      "lead-user"
    );
    expect(result).toBe("member-1");
  });

  it("falls back to the committing user when there's no suggested owner at all", async () => {
    const supabase = fakeSupabase({ members: [], matches: [] });
    const result = await resolveOwnerUserId(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      "project-1",
      null,
      null,
      "lead-user"
    );
    expect(result).toBe("lead-user");
  });

  it("falls back to the committing user when the suggested name doesn't match exactly one member", async () => {
    const supabase = fakeSupabase({
      members: [{ user_id: "member-1" }],
      matches: [],
    });
    const result = await resolveOwnerUserId(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase as any,
      "project-1",
      null,
      "Nobody Recognizable",
      "lead-user"
    );
    expect(result).toBe("lead-user");
  });
});
