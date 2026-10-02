import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Bypasses Row-Level Security entirely. Use only from the background worker
 * (src/jobs/worker.ts) and other trusted server-only code that must act
 * across projects (e.g. the auth-sync trigger's equivalents, admin tooling).
 * Request-scoped server actions and pages should use
 * `src/lib/supabase/server.ts` instead, so RLS applies under the signed-in
 * user's identity.
 */
export function getSupabaseServiceRoleClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
