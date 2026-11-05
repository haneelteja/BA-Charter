import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the Delivery Partners tab (EPIC 18): configuring partners in
 * priority order, creating a delivery (auto-assigned to partner #1), and
 * the fallback path when a partner declines. Uses its own throwaway user
 * and project, cleaned up in a `finally`, same pattern as core-flows.spec.ts.
 */
test("delivery partners: priority order, auto-assignment, and fallback on decline", async ({ page }) => {
  const email = `e2e-delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "DeliveryFlowTest7!";
  const admin = getAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = created!.user!.id;

  let projectId: string | undefined;

  try {
    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(email);
    await passwordForm.locator('input[name="password"]').fill(password);
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.getByText("+ New project").click();
    await page.fill('input[name="project_name"]', "E2E Delivery Project");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });

    const { data: projects } = await admin
      .from("project")
      .select("project_id")
      .eq("project_name", "E2E Delivery Project")
      .eq("lead_ba_id", userId);
    expect(projects).toHaveLength(1);
    projectId = projects![0].project_id;

    await page.goto(`/projects/${projectId}/delivery`);

    // Add two partners — second one should become the fallback. Each
    // partner's name renders twice (the ordered list and the analytics
    // card below it), so scope to the first match. The <details> toggle
    // is plain HTML state that resets on every server-action revalidation,
    // so wait for the field to actually be visible before filling it
    // rather than assuming the click opened it instantly.
    const addPartnerDetails = page.locator("details", { has: page.getByText("+ Add delivery partner") });
    for (const name of ["Partner One", "Partner Two"]) {
      // A plain click on <summary> races with the RSC patch that lands
      // after the previous form's revalidatePath — it reliably opens the
      // very first time (nothing to race with yet) but not reliably after
      // a revalidation has just replaced this subtree. Setting `open`
      // directly sidesteps the race rather than chasing its timing.
      await addPartnerDetails.evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
      await expect(page.locator("#name")).toBeVisible();
      await page.fill("#name", name);
      await page.getByRole("button", { name: "Add partner" }).click();
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });
    }

    const { data: partners } = await admin
      .from("delivery_partner")
      .select("delivery_partner_id, name, priority_order")
      .eq("project_id", projectId!)
      .order("priority_order", { ascending: true });
    expect(partners).toHaveLength(2);
    expect(partners![0].name).toBe("Partner One");
    expect(partners![1].name).toBe("Partner Two");

    // Create a delivery — should auto-assign to Partner One.
    await page.locator("details", { has: page.getByText("+ New delivery") }).evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    await expect(page.locator("#recipient_name")).toBeVisible();
    await page.fill("#recipient_name", "Jane Recipient");
    await page.getByRole("button", { name: "Create delivery" }).click();
    await expect(page.getByText("Jane Recipient")).toBeVisible();

    let delivery: { delivery_id: string; status: string; current_partner_id: string } | null = null;
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("delivery")
          .select("delivery_id, status, current_partner_id")
          .eq("project_id", projectId!)
          .maybeSingle();
        delivery = data as typeof delivery;
        return delivery?.status;
      }, { timeout: 10000 })
      .toBe("Assigned");
    expect(delivery!.current_partner_id).toBe(partners![0].delivery_partner_id);

    // Decline on Partner One — should fall back to Partner Two.
    await page.getByText("Partner declined / failed — try next partner").click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("delivery")
          .select("status, current_partner_id, attempt_sequence")
          .eq("delivery_id", delivery!.delivery_id)
          .single();
        return data;
      }, { timeout: 10000 })
      .toMatchObject({ status: "Assigned", current_partner_id: partners![1].delivery_partner_id, attempt_sequence: 2 });

    const { data: attempts } = await admin
      .from("delivery_attempt")
      .select("status, sequence_no, delivery_partner_id")
      .eq("delivery_id", delivery!.delivery_id)
      .order("sequence_no", { ascending: true });
    expect(attempts).toHaveLength(2);
    expect(attempts![0]).toMatchObject({ status: "Declined", sequence_no: 1, delivery_partner_id: partners![0].delivery_partner_id });
    expect(attempts![1]).toMatchObject({ status: "Assigned", sequence_no: 2, delivery_partner_id: partners![1].delivery_partner_id });

    // Mark delivered on Partner Two.
    await page.getByRole("button", { name: "Mark delivered" }).click();
    await expect(page.getByText("Delivered", { exact: true })).toBeVisible();

    await expect
      .poll(async () => {
        const { data } = await admin.from("delivery").select("status").eq("delivery_id", delivery!.delivery_id).single();
        return data?.status;
      }, { timeout: 10000 })
      .toBe("Delivered");
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
