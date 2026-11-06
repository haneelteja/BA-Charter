import { expect, test } from "@playwright/test";
import { deleteTestProject, env, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the Meeting Ingestion case-level SLA timer (EPIC 5 follow-up):
 * Requirements §3.2 — "minutes of meeting drafted within fifteen minutes
 * of source upload." No timer existed before this; the job queue only did
 * FIFO + retry. Drives this through the real /api/cron/sweeps endpoint
 * (the one Vercel Cron hits), same pattern as delivery-sla-timeout.spec.ts.
 */
test("an interaction with no minutes drafted within 15 minutes is flagged SLA-breached", async ({
  page,
  request,
  baseURL,
}) => {
  const admin = getAdminClient();
  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-sla-ingestion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "IngestionSlaTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = userResult!.user!.id;

  let projectId: string | undefined;

  try {
    const { data: project, error: projectError } = await admin
      .from("project")
      .insert({ project_name: `E2E Ingestion SLA Project ${Date.now()}`, status: "Active", lead_ba_id: userId })
      .select("project_id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.project_id;
    await admin.from("project_member").insert({ project_id: projectId, user_id: userId, role_name: "LeadBA" });

    // Simulate "captured 20 minutes ago" — past the 15-minute SLA — with no
    // minutes_document ever created for it.
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: interaction, error: interactionError } = await admin
      .from("interaction")
      .insert({
        project_id: projectId,
        source_type: "ManualNote",
        title: "E2E SLA breach call",
        processing_status: "Extracted",
        ingested_at: twentyMinutesAgo,
      })
      .select("interaction_id")
      .single();
    expect(interactionError).toBeNull();
    const interactionId = interaction!.interaction_id;

    // A second interaction, also captured 20 minutes ago, but WITH minutes
    // already drafted — must not be flagged.
    const { data: onTimeInteraction, error: onTimeError } = await admin
      .from("interaction")
      .insert({
        project_id: projectId,
        source_type: "ManualNote",
        title: "E2E on-time call",
        processing_status: "Confirmed",
        ingested_at: twentyMinutesAgo,
      })
      .select("interaction_id")
      .single();
    expect(onTimeError).toBeNull();
    const onTimeInteractionId = onTimeInteraction!.interaction_id;
    await admin.from("minutes_document").insert({
      project_id: projectId,
      interaction_id: onTimeInteractionId,
      subject: "On-time minutes",
      body_html: "<p>Drafted in time.</p>",
      status: "Draft",
    });

    const response = await request.get(`${baseURL}/api/cron/sweeps`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    expect(response.ok()).toBe(true);

    const { data: breached } = await admin
      .from("interaction")
      .select("sla_breached_at")
      .eq("interaction_id", interactionId)
      .single();
    expect(breached?.sla_breached_at).not.toBeNull();

    const { data: onTime } = await admin
      .from("interaction")
      .select("sla_breached_at")
      .eq("interaction_id", onTimeInteractionId)
      .single();
    expect(onTime?.sla_breached_at).toBeNull();

    // UI: the breached interaction shows the badge; the on-time one doesn't.
    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(userResult!.user!.email!);
    await passwordForm.locator('input[name="password"]').fill("IngestionSlaTest7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto(`/projects/${projectId}/interactions`);
    const breachedRow = page.locator("li", { hasText: "E2E SLA breach call" });
    await expect(breachedRow.getByText("SLA breached")).toBeVisible();
    const onTimeRow = page.locator("li", { hasText: "E2E on-time call" });
    await expect(onTimeRow.getByText("SLA breached")).not.toBeVisible();

    await page.goto(`/projects/${projectId}/interactions/${interactionId}`);
    await expect(page.getByText(/weren't drafted within the 15-minute service level/)).toBeVisible();
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
