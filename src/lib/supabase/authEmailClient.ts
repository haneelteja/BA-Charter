import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * A plain @supabase/supabase-js client — deliberately NOT @supabase/ssr's
 * createServerClient — used only for the three calls that trigger an auth
 * email: signUp, signInWithOtp, resetPasswordForEmail.
 *
 * @supabase/ssr's createServerClient/createBrowserClient hardcode
 * `flowType: "pkce"` unconditionally (confirmed by reading
 * node_modules/@supabase/ssr/dist/main/create{Server,Browser}Client.js:
 * `auth: { ...options?.auth, flowType: "pkce", ... }` — the literal is
 * placed AFTER spreading the caller's own `auth` options, so passing
 * `auth: { flowType: "implicit" }` to either of those is silently
 * discarded). PKCE requires the code_verifier stashed by the call that
 * requested the email to still be in that SAME browser when the link is
 * later opened — broken whenever it's opened in a different browser,
 * device, or app (an email client's in-app browser, a phone vs. the
 * desktop that requested the reset, ...), which is the common case for
 * email links, not an edge case ("PKCE code verifier not found in
 * storage").
 *
 * @supabase/supabase-js's own createClient has no such override — its
 * underlying GoTrueClient defaults to, and honors, flowType: "implicit"
 * (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js), so calling
 * it directly here actually takes effect: Supabase skips the PKCE code
 * challenge and the emailed link delivers the session as a URL hash
 * fragment instead, needing no locally-stored state — already handled by
 * /auth/confirm/page.tsx as its primary path.
 *
 * This client never persists a session — each call here is a one-shot
 * "ask Supabase to send an email" request, not a sign-in — so it doesn't
 * need cookies, storage, or auto-refresh.
 */
export function getSupabaseAuthEmailClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
