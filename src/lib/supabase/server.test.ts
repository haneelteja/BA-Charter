import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  createServerClient.mockReturnValue({});
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("getSupabaseServerClient", () => {
  it("forces implicit flow — this client is what resetPasswordForEmail/signInWithOtp/signUp run through, and its flowType decides whether the emailed link needs a code_verifier stashed in the requesting browser", async () => {
    const { getSupabaseServerClient } = await import("./server");

    await getSupabaseServerClient();

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({ auth: expect.objectContaining({ flowType: "implicit" }) })
    );
  });
});
