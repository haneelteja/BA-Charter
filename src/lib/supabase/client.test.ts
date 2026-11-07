import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.fn();
vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  createBrowserClient.mockReturnValue({});
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("getSupabaseBrowserClient", () => {
  it("forces implicit flow — PKCE's code_verifier can't survive an email link opened in a different browser/device", async () => {
    const { getSupabaseBrowserClient } = await import("./client");

    getSupabaseBrowserClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({ auth: expect.objectContaining({ flowType: "implicit" }) })
    );
  });
});
