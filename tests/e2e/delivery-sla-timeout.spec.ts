import { expect, test } from "@playwright/test";
import { deleteTestProject, env, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the automatic SLA-timeout fallback (EPIC 18 follow-up): a partner
 * with sla_hours set whose current attempt has been assigned longer than
 * that gets auto-declined by the sweep_delivery_timeout job, falling back
 * to the next active partner — same outcome as a manual decline, just
 * triggered by time instead of a click. Drives this through the real
 * /api/cron/sweeps endpoint (the same one Vercel Cron hits) rather than
 * importing the handler directly, so this exercises the actual wiring.
 */
test("a delivery automatically falls back to the next partner once its current partner's SLA has elapsed", async ({
  request,
  baseURL,
}) => {
  const admin = getAdminClient();
  const projectName = `E2E SLA Timeout Project ${Date.now()}`;

  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-sla-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "SlaTimeoutTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = userResult!.user!.id;

  let projectId: string | undefined;

  try {
    const { data: project, error: projectError } = await admin
      .from("project")
      .insert({ project_name: projectName, status: "Active", lead_ba_id: userId })
      .select("project_id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.project_id;
    await admin.from("project_member").insert({ project_id: projectId, user_id: userId, role_name: "LeadBA" });

    const { data: partners, error: partnersError } = await admin
      .from("delivery_partner")
      .insert([
        { project_id: projectId, name: "Slow Partner", priority_order: 1, sla_hours: 1 },
        { project_id: projectId, name: "Fallback Partner", priority_order: 2 },
      ])
      // PostgREST can only order an insert's returned rows by a column
      // that's in the select list — priority_order has to be here even
      // though only delivery_partner_id/name are read below.
      .select("delivery_partner_id, name, priority_order")
      .order("priority_order", { ascending: true });
    expect(partnersError).toBeNull();
    const slowPartner = partners!.find((p) => p.name === "Slow Partner")!;
    const fallbackPartner = partners!.find((p) => p.name === "Fallback Partner")!;

    const { data: delivery, error: deliveryError } = await admin
      .from("delivery")
      .insert({ project_id: projectId, recipient_name: "SLA Test Recipient" })
      .select("delivery_id")
      .single();
    expect(deliveryError).toBeNull();
    const deliveryId = delivery!.delivery_id;

    // Simulate "assigned 2 hours ago" against a 1-hour SLA, bypassing a
    // real 1-hour wait — this is what the sweep's own clock check reads.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await admin.from("delivery_attempt").insert({
      delivery_id: deliveryId,
      delivery_partner_id: slowPartner.delivery_partner_id,
      sequence_no: 1,
      status: "Assigned",
      assigned_at: twoHoursAgo,
    });
    await admin
      .from("delivery")
      .update({ status: "Assigned", current_partner_id: slowPartner.delivery_partner_id, attempt_sequence: 1, assigned_at: twoHoursAgo })
      .eq("delivery_id", deliveryId);

    const response = await request.get(`${baseURL}/api/cron/sweeps`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    expect(response.ok()).toBe(true);

    const { data: updatedDelivery, error: updatedError } = await admin
      .from("delivery")
      .select("status, current_partner_id, attempt_sequence")
      .eq("delivery_id", deliveryId)
      .single();
    expect(updatedError).toBeNull();
    expect(updatedDelivery).toMatchObject({
      status: "Assigned",
      current_partner_id: fallbackPartner.delivery_partner_id,
      attempt_sequence: 2,
    });

    const { data: attempts } = await admin
      .from("delivery_attempt")
      .select("status, sequence_no, delivery_partner_id")
      .eq("delivery_id", deliveryId)
      .order("sequence_no", { ascending: true });
    expect(attempts).toHaveLength(2);
    expect(attempts![0]).toMatchObject({ status: "Declined", sequence_no: 1, delivery_partner_id: slowPartner.delivery_partner_id });
    expect(attempts![1]).toMatchObject({ status: "Assigned", sequence_no: 2, delivery_partner_id: fallbackPartner.delivery_partner_id });
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
