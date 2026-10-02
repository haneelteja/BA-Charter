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
    }
  );
}
