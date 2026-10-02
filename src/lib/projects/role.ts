import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectRole = "BusinessAnalyst" | "LeadBA" | "DeliveryMember" | "Administrator";

/**
 * RLS only enforces project membership (see 0004_rls_policies.sql). Role-
 * specific rules — "only the Lead Business Analyst may resolve a conflict"
 * (§3.8), approval gates, etc. — are application-layer checks on top of
 * that floor. Every action enforcing one of those rules should call this
 * rather than re-querying project_member inline.
 */
export async function getProjectRole(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<ProjectRole | null> {
  const { data, error } = await supabase
    .from("project_member")
    .select("role_name")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve project role: ${error.message}`);
  }

  return (data?.role_name as ProjectRole | undefined) ?? null;
}

export function isLead(role: ProjectRole | null): boolean {
  return role === "LeadBA" || role === "Administrator";
}
