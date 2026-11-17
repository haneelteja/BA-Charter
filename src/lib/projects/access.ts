import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getProjectRole, isLead, type ProjectRole } from "./role";

/**
 * What an action needs from the caller's project role.
 * - member: any role, including the read-only DeliveryMember
 * - author: Business Analyst, Lead BA or Administrator (DeliveryMember "does not author content", Requirements §2)
 * - lead:   Lead BA or Administrator
 *
 * The database enforces the same rules (migration 0026: role-aware RLS and
 * status-transition triggers); this check runs first so the user gets a
 * clear message instead of a generic row-level-security error.
 */
export type ProjectAccess = "member" | "author" | "lead";

export class ProjectAccessError extends Error {}

const AUTHOR_ROLES: ProjectRole[] = ["BusinessAnalyst", "LeadBA", "Administrator"];

export function roleAllows(role: ProjectRole | null, access: ProjectAccess): boolean {
  if (!role) return false;
  if (access === "member") return true;
  if (access === "author") return AUTHOR_ROLES.includes(role);
  return isLead(role);
}

const MESSAGES: Record<ProjectAccess, string> = {
  member: "You are not a member of this project.",
  author: "Your project role is read-only. Ask a Lead BA to change your role if you need to edit.",
  lead: "Only a Lead Business Analyst or Administrator can do this.",
};

export async function requireProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
  access: ProjectAccess
): Promise<{ user: User; role: ProjectRole }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new ProjectAccessError("Not signed in.");
  }
  if (!projectId) {
    throw new ProjectAccessError("Missing project.");
  }
  const role = await getProjectRole(supabase, projectId, auth.user.id);
  if (!roleAllows(role, access)) {
    throw new ProjectAccessError(role ? MESSAGES[access] : MESSAGES.member);
  }
  return { user: auth.user, role: role as ProjectRole };
}
