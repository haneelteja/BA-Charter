import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/env";

/** Browser-side Supabase client, for client components (e.g. the sign-in form). */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}
