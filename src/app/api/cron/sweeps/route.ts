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
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${requireEnv("CRON_SECRET")}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await enqueueJob("sweep_action_item_overdue", {});
  await enqueueJob("sweep_clarification_ageing", {});

  const processed = await processPendingJobs({ maxJobs: 50 });

  return NextResponse.json({ ok: true, processed });
}
