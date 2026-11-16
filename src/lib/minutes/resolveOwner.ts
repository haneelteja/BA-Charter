import type { getSupabaseServerClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/**
 * §8 rule 8: action items and clarifications must resolve to a named
 * person. The Confirm-stage accept form (page.tsx) lets a BA pick the real
 * project member directly, stored on
 * `extraction_candidate.resolved_owner_user_id` — that's used here whenever
 * present. Older candidates accepted before that picker existed (or left
 * "Unassigned") only have the free-text `suggestedOwner` extraction
 * produced, so those fall back to an exact case-insensitive name match
 * against project members, and finally to whoever is running the commit
 * (the approving Lead BA) if nothing resolves — a safe default that keeps
 * the NOT NULL/CHECK constraints satisfied.
 *
 * Pulled out of minutes-actions.ts (a "use server" file, where every
 * export becomes a Server Action) so it stays a plain, directly
 * unit-testable function.
 */
export async function resolveOwnerUserId(
  supabase: Supa,
  projectId: string,
  resolvedOwnerUserId: string | null,
  suggestedOwner: string | null,
  fallbackUserId: string
): Promise<string> {
  if (resolvedOwnerUserId) return resolvedOwnerUserId;
  if (!suggestedOwner) return fallbackUserId;

  const { data: memberRows } = await supabase
    .from("project_member")
    .select("user_id")
    .eq("project_id", projectId);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) return fallbackUserId;

  const { data: matches } = await supabase
    .from("app_user")
    .select("user_id, full_name")
    .in("user_id", memberIds)
    .ilike("full_name", suggestedOwner.trim());

  return matches && matches.length === 1 ? matches[0].user_id : fallbackUserId;
}
