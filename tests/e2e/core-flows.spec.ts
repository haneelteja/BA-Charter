import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the project/charter CRUD path with a dedicated throwaway test
 * user (created, signed in, and deleted within the test) rather than the
 * shared dev account — this suite should never depend on, or mutate,
 * anyone's real credentials or real project data.
 */
test("create a project, add a charter entry, edit it with the optimistic-concurrency field intact", async ({
  page,
}) => {
  const email = `e2e-core-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "CoreFlowTest7!";
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
    // Sign in as the throwaway user.
    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(email);
    await passwordForm.locator('input[name="password"]').fill(password);
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    // Create a project through the real form. The form lives on "/" itself
    // and the action redirects to "/projects/<id>" on success, so waiting
    // for the URL to merely equal "/" resolves immediately (it's already
    // there) instead of waiting for the submission to actually land — wait
    // for the redirect's real destination instead.
    await page.getByText("+ New project").click();
    await page.fill('input[name="project_name"]', "E2E Core Flow Project");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });

    const { data: projects } = await admin
      .from("project")
      .select("project_id")
      .eq("project_name", "E2E Core Flow Project")
      .eq("lead_ba_id", userId);
    expect(projects).toHaveLength(1);
    projectId = projects![0].project_id;

    // Charter: create an entry, then edit it — exercises the hidden
    // expected_version_no field that guards against concurrent overwrites.
    await page.goto(`/projects/${projectId}/charter`);
    await page.getByText("+ New charter entry").click();
    await page.selectOption('select[name="layer"]', "SystemOverview");
    await page.fill('input[name="title"]', "Overview v1");
    await page.getByRole("button", { name: "Add entry" }).click();

    let node: { knowledge_node_id: string; version_no: number; title: string } | null = null;
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("knowledge_node")
          .select("knowledge_node_id, version_no, title")
          .eq("project_id", projectId!)
          .maybeSingle();
        node = data as typeof node;
        return node?.title;
      }, { timeout: 10000 })
      .toBe("Overview v1");
    expect(node!.version_no).toBe(1);

    await page.goto(`/projects/${projectId}/charter`);
    await page.locator("details:has-text('Edit') summary").first().click();
    await page.fill('form:has(input[name="expected_version_no"]) input[name="title"]', "Overview v2");
    await page.getByRole("button", { name: "Save (new version)" }).click();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("knowledge_node")
          .select("title, version_no")
          .eq("knowledge_node_id", node!.knowledge_node_id)
          .single();
        return data;
      }, { timeout: 10000 })
      .toMatchObject({ title: "Overview v2", version_no: 2 });
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
