import { expect, test } from "@playwright/test";
import { getAdminClient, getAnonClient } from "./helpers/supabase-admin";

/**
 * Every test here creates its own throwaway Supabase Auth user and deletes
 * it afterward — deliberately never touches the shared dev account used
 * for manual testing, so running this suite has no side effects on
 * anyone's real credentials.
 */
function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.describe("Sign-in page", () => {
  test("renders magic link, password, and sign-up sections with a forgot-password link", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "BA Charter" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Magic link" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByText("New here? Create an account")).toBeVisible();
  });
});

test.describe("Sign-up validation", () => {
  test("rejects a password missing complexity rules with a specific message", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByText("New here? Create an account").click();
    await page.fill("#signup-name", "E2E Test");
    await page.fill("#signup-email", uniqueEmail("weakpw"));
    await page.fill("#signup-password", "weakweak"); // 8+ chars, lowercase only
    await page.fill("#signup-confirm-password", "weakweak");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/error=/);
    const url = new URL(page.url());
    expect(url.searchParams.get("error")).toContain("uppercase letter");
    expect(url.searchParams.get("form")).toBe("signup");
  });

  test("rejects mismatched password confirmation and keeps the sign-up section open", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByText("New here? Create an account").click();
    await page.fill("#signup-name", "E2E Test");
    await page.fill("#signup-email", uniqueEmail("mismatch"));
    await page.fill("#signup-password", "Correct7!horse");
    await page.fill("#signup-confirm-password", "Different7!horse");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Passwords don't match.")).toBeVisible();
    await expect(page.locator("details")).toHaveJSProperty("open", true);
  });

  test("the live password-strength checklist updates per rule as the user types", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByText("New here? Create an account").click();
    const passwordField = page.locator("#signup-password");

    await passwordField.fill("abc");
    await expect(page.getByText("One lowercase letter")).toHaveClass(/text-emerald/);
    await expect(page.getByText("One uppercase letter")).not.toHaveClass(/text-emerald/);

    await passwordField.fill("Correct7!horse");
    await expect(page.getByText("One uppercase letter")).toHaveClass(/text-emerald/);
    await expect(page.getByText("One number")).toHaveClass(/text-emerald/);
    await expect(page.getByText("One special character")).toHaveClass(/text-emerald/);
  });

  test("a complete, valid sign-up passes every validation rule (mail relay is a separate, known environment constraint)", async ({
    page,
  }) => {
    const email = uniqueEmail("signup-ok");
    await page.goto("/sign-in");
    await page.getByText("New here? Create an account").click();
    await page.fill("#signup-name", "E2E Signup Success");
    await page.fill("#signup-email", email);
    await page.fill("#signup-password", "Correct7!horse");
    await page.fill("#signup-confirm-password", "Correct7!horse");
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL(/[?&](check-email=1|error=)/, { timeout: 10000 });
    const url = new URL(page.url());

    if (url.searchParams.has("error")) {
      // This environment's configured Resend sender (onboarding@resend.dev,
      // a sandbox address) can only deliver to the Resend account's own
      // verified email — any other recipient fails at the mail-relay step,
      // strictly after every validation rule already passed. That's this
      // environment's infra, not a regression — fail only if the error is
      // something else (a real validation bug would say so specifically).
      expect(url.searchParams.get("error")).toBe("Error sending confirmation email");
    } else {
      await expect(page.getByText("Check your email to finish signing in.")).toBeVisible();
    }

    const admin = getAdminClient();
    const { data } = await admin.auth.admin.listUsers();
    const created = data.users.find((u) => u.email === email);
    if (created) await admin.auth.admin.deleteUser(created.id);
  });
});

test.describe("Password sign-in", () => {
  test("signs in with correct credentials and rejects incorrect ones", async ({ page }) => {
    const email = uniqueEmail("password-signin");
    const password = "RealPassword7!";
    const admin = getAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr).toBeNull();

    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(email);
    await passwordForm.locator('input[name="password"]').fill("WrongPassword7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid login credentials")).toBeVisible();

    await passwordForm.locator('input[name="email"]').fill(email);
    await passwordForm.locator('input[name="password"]').fill(password);
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    if (created?.user) await admin.auth.admin.deleteUser(created.user.id);
  });
});

test.describe("Forgot password / reset password", () => {
  test("the /forgot-password form passes validation (mail relay is a separate, known environment constraint)", async ({
    page,
  }) => {
    const email = uniqueEmail("reset-form");
    const admin = getAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: "SomePassword7!",
      email_confirm: true,
    });
    expect(createErr).toBeNull();

    await page.goto("/forgot-password");
    await page.fill("#forgot-email", email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.waitForURL(/[?&](check-email=1|error=)/, { timeout: 10000 });

    const url = new URL(page.url());
    if (url.searchParams.has("error")) {
      // Same onboarding@resend.dev sandbox-sender constraint as sign-up —
      // see that test's comment. Fail only on an unexpected error.
      expect(url.searchParams.get("error")).toBe("Error sending recovery email");
    } else {
      await expect(page.getByText(/Check your inbox/)).toBeVisible();
    }

    if (created?.user) await admin.auth.admin.deleteUser(created.user.id);
  });

  test("clicking a real recovery link authenticates and lets the user set a new password that actually works", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail("reset-flow");
    const oldPassword = "OldPassword7!";
    const newPassword = "BrandNewPassword9!";
    const admin = getAdminClient();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: oldPassword,
      email_confirm: true,
    });
    expect(createErr).toBeNull();

    // Generates the exact link Supabase's own email would contain, without
    // depending on mail actually being relayed (see the form-validation
    // test above for why that's unreliable in this environment) — this is
    // what exercises the real, previously-broken bridge: the fragment-based
    // session hand-off at /auth/confirm, clicked for real end to end.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${baseURL}/auth/confirm?next=%2Freset-password` },
    });
    expect(linkErr).toBeNull();

    await page.goto(linkData!.properties!.action_link);
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByText(email)).toBeVisible();

    await page.fill("#reset-password", newPassword);
    await page.fill("#reset-confirm-password", newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(baseURL! + "/");

    const anon = getAnonClient();
    const { error: signInErr } = await anon.auth.signInWithPassword({ email, password: newPassword });
    expect(signInErr).toBeNull();

    if (created?.user) await admin.auth.admin.deleteUser(created.user.id);
  });

  test("/reset-password redirects to sign-in with a clear error when visited without a session", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();
  });
});

test.describe("Magic link", () => {
  test("a real magic link authenticates the user", async ({ page, baseURL }) => {
    const email = uniqueEmail("magiclink");
    const admin = getAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    expect(createErr).toBeNull();

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${baseURL}/auth/confirm` },
    });
    expect(linkErr).toBeNull();

    await page.goto(linkData!.properties!.action_link);
    await expect(page).toHaveURL(baseURL! + "/");

    if (created?.user) await admin.auth.admin.deleteUser(created.user.id);
  });
});
