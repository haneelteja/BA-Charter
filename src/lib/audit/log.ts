import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventType =
  | "Confirmed"
  | "Approved"
  | "Published"
  | "ModelUpdated"
  | "ConflictResolved"
  | "Created"
  | "Updated"
  | "Deleted"
  | "StatusChanged"
  | "Escalated";

export interface AuditLogInput {
  projectId: string;
  actorUserId: string | null;
  eventType: AuditEventType;
  targetObjectType?: string;
  targetObjectId?: string;
  priorValue?: unknown;
  newValue?: unknown;
}

/**
 * Every mutating server action calls this (EXECUTION_PLAN.md EPIC 0 —
 * "audit logging infra baked in from day 1", not bolted on later per
 * Requirements §7 Auditability). Pass the same Supabase client the action is
 * already using so the audit row and the mutation share one transaction's
 * RLS context.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  input: AuditLogInput
): Promise<void> {
  const { error } = await supabase.from("audit_event").insert({
    project_id: input.projectId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    target_object_type: input.targetObjectType ?? null,
    target_object_id: input.targetObjectId ?? null,
    prior_value: input.priorValue ?? null,
    new_value: input.newValue ?? null,
  });

  if (error) {
    throw new Error(`Failed to write audit event: ${error.message}`);
  }
}
