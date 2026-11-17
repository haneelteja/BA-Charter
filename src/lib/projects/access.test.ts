import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireProjectAccess, roleAllows } from "./access";

describe("roleAllows", () => {
  it.each([
    ["DeliveryMember", "member", true],
    ["DeliveryMember", "author", false],
    ["DeliveryMember", "lead", false],
    ["BusinessAnalyst", "author", true],
    ["BusinessAnalyst", "lead", false],
    ["LeadBA", "lead", true],
    ["Administrator", "lead", true],
    [null, "member", false],
  ] as const)("%s needs %s -> %s", (role, access, expected) => {
    expect(roleAllows(role, access)).toBe(expected);
  });
});

function fakeClient(userId: string | null, role: string | null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: role ? { role_name: role } : null, error: null }),
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
    from: () => query,
  } as unknown as SupabaseClient;
}

describe("requireProjectAccess", () => {
  it("rejects a signed-out caller", async () => {
    await expect(requireProjectAccess(fakeClient(null, null), "p", "member")).rejects.toThrow("Not signed in.");
  });
  it("rejects a non-member", async () => {
    await expect(requireProjectAccess(fakeClient("u", null), "p", "member")).rejects.toThrow("not a member");
  });
  it("rejects a delivery member trying to author", async () => {
    await expect(requireProjectAccess(fakeClient("u", "DeliveryMember"), "p", "author")).rejects.toThrow("read-only");
  });
  it("returns the user and role when allowed", async () => {
    const result = await requireProjectAccess(fakeClient("u", "LeadBA"), "p", "lead");
    expect(result.role).toBe("LeadBA");
    expect(result.user.id).toBe("u");
  });
});
