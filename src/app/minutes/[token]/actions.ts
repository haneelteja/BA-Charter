"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { logAuditEvent } from "@/lib/audit/log";
import { getMinutesAckRecord } from "@/lib/minutes/ackToken";
import { revertMinutesDispute } from "@/lib/minutes/dispute";

/**
 * Both actions below are reachable with no Supabase session at all — the
 * token itself, looked up via getMinutesAckRecord, is the only
 * authorization check. Never accept an id (minutesId, recipientId, …)
 * from the client directly here; everything must be derived from the
 * token lookup so a crafted form value can't target a different row.
 */

export async function acknowledgeMinutes(token: string) {
  const supabase = getSupabaseServiceRoleClient();
  const record = await getMinutesAckRecord(supabase, token);
  if (!record) {
    throw new Error("This link is invalid or has expired.");
  }

  if (!record.acknowledgedAt) {
    const { error } = await supabase
      .from("minutes_recipient")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("recipient_id", record.recipientId);
    if (error) throw new Error(`Failed to record acknowledgement: ${error.message}`);

    await logAuditEvent(supabase, {
      projectId: record.projectId,
      actorUserId: null,
      eventType: "Confirmed",
      targetObjectType: "MinutesDocument",
      targetObjectId: record.minutesId,
      newValue: { acknowledged_by: record.email },
    });
  }

  revalidatePath(`/minutes/${token}`);
}

export async function disputeMinutesPublic(token: string, formData: FormData) {
  const disputeNote = String(formData.get("dispute_note") ?? "").trim();
  if (!disputeNote) {
    throw new Error("Describe the issue before submitting.");
  }

  const supabase = getSupabaseServiceRoleClient();
  const record = await getMinutesAckRecord(supabase, token);
  if (!record) {
    throw new Error("This link is invalid or has expired.");
  }
  if (record.status === "Disputed") {
    revalidatePath(`/minutes/${token}`);
    return;
  }

  const { decisionIds } = await revertMinutesDispute(supabase, {
    minutesId: record.minutesId,
    interactionId: record.interactionId,
    disputeNote,
  });

  const { error: recipientError } = await supabase
    .from("minutes_recipient")
    .update({ disputed_at: new Date().toISOString() })
    .eq("recipient_id", record.recipientId);
  if (recipientError) throw new Error(`Failed to record dispute: ${recipientError.message}`);

  await logAuditEvent(supabase, {
    projectId: record.projectId,
    actorUserId: null,
    eventType: "StatusChanged",
    targetObjectType: "MinutesDocument",
    targetObjectId: record.minutesId,
    newValue: { status: "Disputed", dispute_note: disputeNote, disputed_by: record.email, reverted_decisions: decisionIds },
  });

  revalidatePath(`/minutes/${token}`);
}
