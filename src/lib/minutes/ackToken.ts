import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 256 bits of entropy — possession of this token is the sole authorization for its row, so it must not be guessable. */
export function generateAckToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Only this hash is stored (migration 0026), so project members who can read
 * minutes_recipient rows cannot take a recipient's link and act as them.
 * Must match the SQL backfill: hex(sha256(utf8(token))).
 */
export function hashAckToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface MinutesAckRecord {
  recipientId: string;
  email: string;
  acknowledgedAt: string | null;
  disputedAt: string | null;
  minutesId: string;
  projectId: string;
  interactionId: string;
  subject: string | null;
  bodyHtml: string | null;
  status: string;
  disputeNote: string | null;
  projectName: string;
  ackWindowEndsAt: string | null;
}

/** True while a dispute can still be raised (§8 rule 4: "within the acknowledgement window"). */
export function isWithinAckWindow(ackWindowEndsAt: string | null, now: Date = new Date()): boolean {
  return ackWindowEndsAt === null || now.getTime() <= new Date(ackWindowEndsAt).getTime();
}

/**
 * The only way this page's data is ever looked up — by the exact token,
 * never by an id a client could supply directly. Always call with the
 * service-role client (no session exists on this public route for RLS to
 * apply under).
 */
export async function getMinutesAckRecord(
  supabase: SupabaseClient,
  token: string
): Promise<MinutesAckRecord | null> {
  // Tokens are 43 base64url characters; anything else cannot match.
  if (!token || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;

  const { data, error } = await supabase
    .from("minutes_recipient")
    .select(
      "recipient_id, email, acknowledged_at, disputed_at, expires_at, minutes_id, minutes_document(minutes_id, project_id, interaction_id, subject, body_html, status, dispute_note, ack_window_ends_at, project(project_name))"
    )
    .eq("ack_token_hash", hashAckToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  const doc = Array.isArray(data.minutes_document) ? data.minutes_document[0] : data.minutes_document;
  if (!doc) return null;
  const project = Array.isArray(doc.project) ? doc.project[0] : doc.project;

  return {
    recipientId: data.recipient_id,
    email: data.email,
    acknowledgedAt: data.acknowledged_at,
    disputedAt: data.disputed_at,
    minutesId: doc.minutes_id,
    projectId: doc.project_id,
    interactionId: doc.interaction_id,
    subject: doc.subject,
    bodyHtml: doc.body_html,
    status: doc.status,
    disputeNote: doc.dispute_note,
    projectName: project?.project_name ?? "Project",
    ackWindowEndsAt: doc.ack_window_ends_at ?? null,
  };
}
