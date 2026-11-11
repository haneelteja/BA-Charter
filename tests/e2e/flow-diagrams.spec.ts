import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the Flow Diagrams tab end to end against a real browser and a
 * real database: creating a blank diagram, adding a shape, editing its
 * label, saving, and confirming the save actually round-trips through
 * `flow_diagram.content` (not just that the client-side state changed) by
 * reloading the page. Doesn't exercise drag-to-connect between two shapes
 * — that's React Flow's own well-tested interaction, not this app's code,
 * and driving a pointer drag onto a specific SVG handle reliably under
 * Playwright is disproportionately fragile for what it would verify.
 */

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/sign-in");
  const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
  await passwordForm.locator('input[name="email"]').fill(email);
  await passwordForm.locator('input[name="password"]').fill(password);
  await passwordForm.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("flow diagrams: create, add a shape, edit its label, save, and reload", async ({ page }) => {
  const email = uniqueEmail("flow");
  const password = "FlowDiagramTest7!";
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
    await signIn(page, email, password);

    await page.getByText("+ New project").click();
    await page.fill('input[name="project_name"]', "E2E Flow Diagram Project");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 25000 });

    const { data: projects } = await admin
      .from("project")
      .select("project_id")
      .eq("project_name", "E2E Flow Diagram Project")
      .eq("lead_ba_id", userId);
    expect(projects).toHaveLength(1);
    projectId = projects![0].project_id;

    await page.locator("aside nav").getByText("Flow Diagrams", { exact: true }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/flow`, { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "Flow Diagrams" })).toBeVisible();

    await page.fill("#title", "Onboarding happy path");
    await page.getByRole("button", { name: "+ Blank diagram" }).click();
    await page.waitForURL(new RegExp(`/projects/${projectId}/flow/[0-9a-f-]+$`), { timeout: 20000 });

    // The React Flow canvas and its "Add shape" panel should be visible.
    await expect(page.getByText("Add shape")).toBeVisible();
    await page.getByRole("button", { name: "Rectangle" }).click();

    const label = page.getByPlaceholder("Label…").first();
    await expect(label).toBeVisible();
    await label.fill("Start here");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByPlaceholder("Label…").first()).toHaveValue("Start here", { timeout: 20000 });

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Flow Diagrams" })).toBeVisible();
    await expect(page.getByText("Onboarding happy path")).toBeVisible();
    await expect(page.getByText("1 shape")).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Onboarding happy path")).toHaveCount(0);
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
