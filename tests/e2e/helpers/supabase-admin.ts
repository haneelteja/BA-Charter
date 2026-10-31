import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import path from "path";

/**
 * Reads .env.local directly rather than relying on dotenv/process.env being
 * pre-loaded — these tests run via `npx playwright test`, not through
 * Next.js's own env loading, and this project has exactly one Supabase
 * project (no separate CI/test instance). That's exactly why this suite is
 * NOT wired into the required CI gate (see tests/e2e/README.md) — it's a
 * local/manual tool that creates and cleans up its own throwaway data
 * against the real project, the same pattern used throughout this
 * project's development to verify auth flows end-to-end.
 */
function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../../../.env.local");
  const content = readFileSync(envPath, "utf8");
  return Object.fromEntries(
    content
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      })
  );
}

export const env = loadEnvLocal();

export function getAdminClient(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getAnonClient(): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Deletes a project row (cascades to everything under it per the schema's FKs) — the standard cleanup for any test that creates one. */
export async function deleteTestProject(projectId: string): Promise<void> {
  const admin = getAdminClient();
  await admin.from("project").delete().eq("project_id", projectId);
}
