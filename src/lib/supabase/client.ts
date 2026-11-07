import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client, for client components.
 *
 * Deliberately doesn't use requireEnv() (src/lib/env.ts) here: that helper
 * does `process.env[name]`, a dynamic property lookup Next.js's bundler
 * cannot statically analyze — only literal `process.env.EXACT_NAME`
 * expressions get replaced with their build-time value in the client
 * bundle. The dynamic form silently resolves to undefined in the browser
 * (while working fine server-side, where a real process.env exists at
 * runtime), which is exactly the failure mode this file avoids by reading
 * both vars as static literals.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createBrowserClient(url, anonKey);
}
