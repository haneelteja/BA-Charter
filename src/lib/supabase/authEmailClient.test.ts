import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAuthEmailClient } from "./authEmailClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * These assert the real wire behavior, not just the client's config:
 * @supabase/auth-js only omits code_challenge/code_challenge_method (the
 * PKCE params that make the emailed link require the SAME browser to
 * complete) when flowType actually resolved to "implicit" — proving the
 * override here isn't silently discarded the way it is by @supabase/ssr's
 * createServerClient (see authEmailClient.ts's header comment).
 */
describe("getSupabaseAuthEmailClient", () => {
  it("resetPasswordForEmail sends no PKCE code_challenge", async () => {
    const client = getSupabaseAuthEmailClient();
    await client.auth.resetPasswordForEmail("person@example.com", { redirectTo: "https://app.example.com/auth/confirm" });

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/recover");
    const body = JSON.parse(init!.body as string);
    expect(body.code_challenge).toBeNull();
    expect(body.code_challenge_method).toBeNull();
  });

  it("signInWithOtp (magic link) sends no PKCE code_challenge", async () => {
    const client = getSupabaseAuthEmailClient();
    await client.auth.signInWithOtp({ email: "person@example.com", options: { shouldCreateUser: true } });

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/otp");
    const body = JSON.parse(init!.body as string);
    expect(body.code_challenge).toBeNull();
    expect(body.code_challenge_method).toBeNull();
  });

  it("signUp sends no PKCE code_challenge", async () => {
    const client = getSupabaseAuthEmailClient();
    await client.auth.signUp({ email: "person@example.com", password: "Correct7!horse" });

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/signup");
    const body = JSON.parse(init!.body as string);
    expect(body.code_challenge).toBeNull();
    expect(body.code_challenge_method).toBeNull();
  });

  it("never persists a session (this client only ever sends one-shot email-trigger requests)", () => {
    const client = getSupabaseAuthEmailClient();
    expect(client.auth as unknown as { persistSession: boolean }).toMatchObject({ persistSession: false });
  });
});
