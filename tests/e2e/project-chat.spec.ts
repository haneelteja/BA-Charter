import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the sidebar restructure and the project-wide RAG chat's
 * surrounding infrastructure — sidebar navigation, document upload, and
 * the chat API route's auth/membership guards. Doesn't exercise an actual
 * LLM-generated response: like every other AI feature in this app (BYOK —
 * see src/lib/ai/userModel.ts), that requires a real per-user API key,
 * and no existing AI feature (extraction, guardrail checks, change
 * analysis) has E2E coverage of its real generation path either, for the
 * same cost/determinism reasons. Verify a real chat answer manually.
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

test("sidebar navigation reaches every project tab", async ({ page }) => {
  const email = uniqueEmail("chat-nav");
  const password = "ChatNavTest7!";
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
    await page.fill('input[name="project_name"]', "E2E Chat Nav Project");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });

    const { data: projects } = await admin
      .from("project")
      .select("project_id")
      .eq("project_name", "E2E Chat Nav Project")
      .eq("lead_ba_id", userId);
    expect(projects).toHaveLength(1);
    projectId = projects![0].project_id;

    // Landing on the project root is now the Chat page, with no embedding
    // model configured yet — the composer should still render.
    await expect(
      page.getByText("No embedding model configured for this project yet")
    ).toBeVisible();
    await expect(page.getByPlaceholder("Ask about this project…")).toBeVisible();

    // Scoped to <aside nav> specifically — the dashboard header above it
    // has its own <nav> with a same-named "Settings" link to a different,
    // global page.
    const nav = page.locator("aside nav");

    await nav.getByText("Charter", { exact: true }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/charter`);
    await expect(page.getByRole("heading", { name: "Charter" })).toBeVisible();

    await nav.getByText("Search", { exact: true }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/search`);
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();

    await nav.getByText("Members", { exact: true }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/members`);
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await nav.getByText("Settings", { exact: true }).click();
    await expect(page).toHaveURL(`/projects/${projectId}/settings`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Embedding model" })).toBeVisible();

    await nav.getByText("Chat", { exact: true }).click();
    await expect(page).toHaveURL(`/projects/${projectId}`);
    await expect(page.getByPlaceholder("Ask about this project…")).toBeVisible();
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test("document upload: ingests a supported file, rejects an unsupported one", async ({ page }) => {
  const email = uniqueEmail("chat-upload");
  const password = "ChatUploadTest7!";
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
    await page.fill('input[name="project_name"]', "E2E Chat Upload Project");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });

    const { data: projects } = await admin
      .from("project")
      .select("project_id")
      .eq("project_name", "E2E Chat Upload Project")
      .eq("lead_ba_id", userId);
    projectId = projects![0].project_id;

    await page.goto(`/projects/${projectId}`);

    const fileInput = page.locator('input[type="file"][name="file"]');

    // Uploads auto-submit on file selection (no separate "Attach file"
    // button — the composer's "+" button only opens this hidden input).
    await fileInput.setInputFiles({
      name: "diagram.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    await expect(page.getByText(/Unsupported file type/)).toBeVisible({ timeout: 15000 });

    await fileInput.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("The project uses OAuth2 for authentication."),
    });
    await expect(page.getByText('Uploaded "notes.txt"')).toBeVisible({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("project_document")
            .select("file_name, extracted_text")
            .eq("project_id", projectId!)
            .maybeSingle();
          return data;
        },
        { timeout: 10000 }
      )
      .toMatchObject({ file_name: "notes.txt", extracted_text: "The project uses OAuth2 for authentication." });
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test("chat API route enforces authentication and project membership", async ({ page, request, baseURL }) => {
  const memberEmail = uniqueEmail("chat-guard-member");
  const outsiderEmail = uniqueEmail("chat-guard-outsider");
  const password = "ChatGuardTest7!";
  const admin = getAdminClient();

  const { data: member, error: memberErr } = await admin.auth.admin.createUser({
    email: memberEmail,
    password,
    email_confirm: true,
  });
  expect(memberErr).toBeNull();
  const { data: outsider, error: outsiderErr } = await admin.auth.admin.createUser({
    email: outsiderEmail,
    password,
    email_confirm: true,
  });
  expect(outsiderErr).toBeNull();

  let projectId: string | undefined;

  try {
    await signIn(page, memberEmail, password);

    await page.getByText("+ New project").click();
    await page.fill('input[name="project_name"]', "E2E Chat Guard Project");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15000 });

    const { data: projects } = await admin
      .from("project")
      .select("project_id")
      .eq("project_name", "E2E Chat Guard Project")
      .eq("lead_ba_id", member!.user!.id);
    projectId = projects![0].project_id;

    const chatUrl = `${baseURL}/api/projects/${projectId}/chat`;
    const chatBody = {
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] }],
    };

    // Unauthenticated: the `request` fixture is its own context, isolated
    // from `page`'s cookie jar, so this call carries no session at all.
    const unauth = await request.post(chatUrl, { data: chatBody });
    expect(unauth.status()).toBe(401);

    // Signed in as a non-member: real session, but no project_member row.
    // Clear the member's session first — signing in again in the same
    // browser context would otherwise just add to/replace it ambiguously.
    await page.context().clearCookies();
    await signIn(page, outsiderEmail, password);
    const forbidden = await page.request.post(chatUrl, { data: chatBody });
    expect(forbidden.status()).toBe(403);
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(member!.user!.id);
    await admin.auth.admin.deleteUser(outsider!.user!.id);
  }
});
