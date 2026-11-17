import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { processPendingJobs } from "@/lib/jobs/processQueue";
import { requireEnv } from "@/lib/env";

/**
 * Owns recurrence for the sweeps that used to self-reschedule through the
 * job queue (EXECUTION_PLAN.md §3.A revision — no standing worker in
 * production). Also doubles as a safety net for anything else that's come
 * due but hasn't been picked up by an after()-triggered drain yet — e.g.
 * promote_provisional_decisions, scheduled hours ahead at distribution
 * time, with no guarantee any user action happens to enqueue something
 * else after it becomes due.
 */
/** Constant-time comparison, so response timing doesn't reveal how much of a guessed secret matched. */
function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"), requireEnv("CRON_SECRET"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await enqueueJob("sweep_action_item_overdue", {});
  await enqueueJob("sweep_clarification_ageing", {});
  await enqueueJob("sweep_delivery_timeout", {});
  await enqueueJob("sweep_meeting_ingestion_sla", {});
  await enqueueJob("retention_purge", {});

  const processed = await processPendingJobs({ maxJobs: 50 });

  return NextResponse.json({ ok: true, processed });
}
