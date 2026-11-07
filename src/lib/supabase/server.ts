import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/env";

/**
 * Request-scoped Supabase client bound to the signed-in user's session via
 * cookies. RLS policies apply under that user's identity (auth.uid()) — this
 * is the client every server action and server component should use unless
 * it specifically needs to bypass RLS (see service-role.ts).
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — the middleware below
            // refreshes the session on the next request instead.
          }
        },
      },
      global: {
        // Next.js patches the global fetch to apply its own Data Cache
        // semantics inside Server Components/Actions, which can reach
        // supabase-js's internal PostgREST/Auth calls too. Force no-store
        // explicitly rather than relying on `export const dynamic =
        // "force-dynamic"` to propagate into every library call this
        // client makes — defensive hardening against stale reads, not a
        // guarantee against every possible caching path.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
      auth: {
        // This client is what calls resetPasswordForEmail/signInWithOtp/
        // signUp, and its flowType determines the style of link Supabase
        // puts in the resulting email. @supabase/ssr defaults to PKCE,
        // which embeds a `?code=` param that can only be exchanged for a
        // session in the same browser/device that requested it (the
        // code_verifier lives in that browser's own cookies) — broken for
        // the common case of opening the email link somewhere else.
        // Implicit flow matches the browser client (src/lib/supabase/
        // client.ts) and delivers the session as a hash fragment instead,
        // which works regardless of where the link is opened.
        flowType: "implicit",
      },
    }
  );
}
