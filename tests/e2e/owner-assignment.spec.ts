import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the real owner-assignment picker on the Confirm-stage accept form
 * (replacing the old free-text suggestedOwner input): it pre-selects a
 * project member whose name matches extraction's free-text suggestion, and
 * an explicit choice persists to `extraction_candidate.resolved_owner_user_id`
 * on accept. Seeds the interaction/candidate directly via the admin client
 * rather than driving the real extraction pipeline, same as
 * candidate-merge-split.spec.ts.
 *
 * Deliberately stops at "accepted" rather than driving Confirm → Generate
 * minutes → Approve & distribute — that last step sends a real email via
 * Resend to every recipient, which no existing test in this suite does
 * (see minutes-ack.spec.ts's comment on the same point); commitToCharter's
 * actual preference order (resolved_owner_user_id, then name-match, then
 * the committing Lead BA) is covered instead by
 * src/lib/minutes/resolveOwner.test.ts, a fast, deterministic unit test
 * with no such side effect.
 */
test("owner-assignment picker pre-selects a name match and persists an explicit choice on accept", async ({
  page,
}) => {
  const admin = getAdminClient();

  const { data: leadResult, error: leadErr } = await admin.auth.admin.createUser({
    email: `e2e-owner-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "OwnerPickerTest7!",
    email_confirm: true,
    user_metadata: { full_name: "Lead Analyst" },
  });
  expect(leadErr).toBeNull();
  const leadUserId = leadResult!.user!.id;

  const { data: memberResult, error: memberErr } = await admin.auth.admin.createUser({
    email: `e2e-owner-member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "OwnerPickerTest7!",
    email_confirm: true,
    user_metadata: { full_name: "Jordan Rivers" },
  });
  expect(memberErr).toBeNull();
  const memberUserId = memberResult!.user!.id;

  let projectId: string | undefined;

  try {
    const { data: project, error: projectError } = await admin
      .from("project")
      .insert({ project_name: `E2E Owner Picker Project ${Date.now()}`, status: "Active", lead_ba_id: leadUserId })
      .select("project_id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.project_id;

    await admin.from("project_member").insert([
      { project_id: projectId, user_id: leadUserId, role_name: "LeadBA" },
      { project_id: projectId, user_id: memberUserId, role_name: "BusinessAnalyst" },
    ]);

    const { data: interaction, error: interactionError } = await admin
      .from("interaction")
      .insert({ project_id: projectId, source_type: "ManualNote", title: "E2E owner picker call", processing_status: "Extracted" })
      .select("interaction_id")
      .single();
    expect(interactionError).toBeNull();
    const interactionId = interaction!.interaction_id;

    const { error: candidateError } = await admin.from("extraction_candidate").insert({
      project_id: projectId,
      interaction_id: interactionId,
      candidate_type: "ActionItem",
      statement: "Set up CI pipeline",
      suggested_owner: "Jordan Rivers",
      confidence_score: 0.9,
      status: "Pending",
    });
    expect(candidateError).toBeNull();

    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(leadResult!.user!.email!);
    await passwordForm.locator('input[name="password"]').fill("OwnerPickerTest7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto(`/projects/${projectId}/interactions/${interactionId}`);

    const row = page.locator("li", { hasText: "Set up CI pipeline" });
    const ownerSelect = row.locator('select[name="resolved_owner_user_id"]');

    // Pre-selected to the member whose name matches the AI's suggestion —
    // not silently resolved behind the scenes, but visible and correctable.
    await expect(ownerSelect).toHaveValue(memberUserId);
    await expect(row.getByText("AI suggested: Jordan Rivers")).toBeVisible();

    // Explicitly override it to the Lead instead.
    await ownerSelect.selectOption({ label: "Lead Analyst" });
    await row.getByRole("button", { name: "Accept" }).click();

    await expect.poll(async () => {
      const { data } = await admin
        .from("extraction_candidate")
        .select("resolved_owner_user_id, status")
        .eq("interaction_id", interactionId)
        .single();
      return data;
    }).toMatchObject({ resolved_owner_user_id: leadUserId, status: "Accepted" });
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(leadUserId);
    await admin.auth.admin.deleteUser(memberUserId);
  }
});
