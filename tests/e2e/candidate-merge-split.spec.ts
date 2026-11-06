import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers merge/split on the Meeting Ingestion Confirm stage (EPIC 6
 * follow-up, explicitly deferred when it first shipped). Seeds the
 * project/interaction/candidates directly via the admin client rather
 * than driving the full extraction pipeline — what's new here is the
 * merge/split actions and their UI, not candidate generation itself.
 *
 * Merge and split are each tested in their own, fully independent test
 * (own throwaway user, project, sign-in) rather than chained one after
 * another in a single session — chaining them was tried first and ruled
 * out as the cause of flakiness seen below (both tests, run completely
 * independently, showed the exact same intermittent behavior).
 *
 * The final DB assertions poll instead of reading once immediately after
 * the UI confirms success: this environment occasionally shows a brief
 * window where a just-committed write (via the signed-in user's session)
 * isn't yet visible to a separate connection (this test's own service-role
 * admin client) — the same read-your-writes gap already handled with
 * `expect.poll` in core-flows.spec.ts, not something specific to
 * merge/split.
 */
async function setUpProjectAndInteraction(admin: ReturnType<typeof getAdminClient>, label: string) {
  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "CandidateTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = userResult!.user!.id;

  const { data: project, error: projectError } = await admin
    .from("project")
    .insert({ project_name: `E2E ${label} Project ${Date.now()}`, status: "Active", lead_ba_id: userId })
    .select("project_id")
    .single();
  expect(projectError).toBeNull();
  const projectId = project!.project_id;

  const { error: memberError } = await admin
    .from("project_member")
    .insert({ project_id: projectId, user_id: userId, role_name: "LeadBA" });
  expect(memberError).toBeNull();

  const { data: interaction, error: interactionError } = await admin
    .from("interaction")
    .insert({ project_id: projectId, source_type: "ManualNote", title: `E2E ${label} call`, processing_status: "Extracted" })
    .select("interaction_id")
    .single();
  expect(interactionError).toBeNull();

  return { userResult: userResult!, userId, projectId, interactionId: interaction!.interaction_id as string };
}

test("merging two same-type candidates produces one correctly linked Pending candidate", async ({ page }) => {
  const admin = getAdminClient();
  const { userResult, userId, projectId, interactionId } = await setUpProjectAndInteraction(admin, "Merge");

  try {
    const { data: mergeCandidates, error: mergeCandidatesError } = await admin
      .from("extraction_candidate")
      .insert([
        { project_id: projectId, interaction_id: interactionId, candidate_type: "Decision", statement: "Use Postgres", confidence_score: 0.9, status: "Pending" },
        { project_id: projectId, interaction_id: interactionId, candidate_type: "Decision", statement: "Use Postgres for storage", confidence_score: 0.7, status: "Pending" },
      ])
      // PostgREST can only order an insert's returned rows by a column
      // included in the select list — see the commit that fixed this same
      // thing in delivery-sla-timeout.spec.ts.
      .select("candidate_id, statement, created_at")
      .order("created_at", { ascending: true });
    expect(mergeCandidatesError).toBeNull();

    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(userResult.user!.email!);
    await passwordForm.locator('input[name="password"]').fill("CandidateTest7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto(`/projects/${projectId}/interactions/${interactionId}`);

    // Check both Decision candidates (scope each <li> by its accept form's
    // hidden candidate_id input, since the statements themselves overlap
    // as substrings of each other and hasText would match both). Checking
    // a box only updates React state via onChange — the merge <form>'s
    // hidden candidate_ids input for that id is added on the next render,
    // not synchronously with .check() resolving, so wait for it to
    // actually land in the DOM before moving on (found by running this: a
    // same-tick checkbox-then-submit left the form's FormData empty).
    for (const c of mergeCandidates!) {
      await page
        .locator("li", { has: page.locator(`input[type="hidden"][value="${c.candidate_id}"]`) })
        .locator('input[type="checkbox"]')
        .check();
      await expect(page.locator(`form input[name="candidate_ids"][value="${c.candidate_id}"]`)).toBeAttached();
    }
    await page.getByPlaceholder("Combined statement").fill("Use Postgres as the primary data store");
    await page.getByRole("button", { name: "Merge checked candidates" }).click();
    await expect(page.getByText("Use Postgres as the primary data store")).toBeVisible();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let afterMerge: any[] = [];
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("extraction_candidate")
            .select("candidate_id, status, statement, candidate_type, confidence_score, merged_from_candidate_ids, merged_into_candidate_id")
            .eq("interaction_id", interactionId)
            .order("created_at", { ascending: true });
          afterMerge = data ?? [];
          return afterMerge.find((c) => c.statement === "Use Postgres as the primary data store")?.status;
        },
        { timeout: 10000 }
      )
      .toBe("Pending");

    const originals = afterMerge!.filter((c) => mergeCandidates!.some((m) => m.candidate_id === c.candidate_id));
    expect(originals.every((c) => c.status === "Merged")).toBe(true);
    const mergedResult = afterMerge!.find((c) => c.statement === "Use Postgres as the primary data store");
    expect(mergedResult).toMatchObject({ status: "Pending", candidate_type: "Decision" });
    expect(mergedResult!.confidence_score).toBeCloseTo(0.8, 5);
    expect(new Set(mergedResult!.merged_from_candidate_ids)).toEqual(
      new Set(mergeCandidates!.map((c) => c.candidate_id))
    );
    expect(originals.every((c) => c.merged_into_candidate_id === mergedResult!.candidate_id)).toBe(true);
  } finally {
    await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test("splitting one Pending candidate produces two correctly linked Pending candidates", async ({ page }) => {
  const admin = getAdminClient();
  const { userResult, userId, projectId, interactionId } = await setUpProjectAndInteraction(admin, "Split");

  try {
    const { data: splitSource, error: splitSourceError } = await admin
      .from("extraction_candidate")
      .insert({
        project_id: projectId,
        interaction_id: interactionId,
        candidate_type: "ActionItem",
        statement: "Set up CI and write onboarding docs",
        confidence_score: 0.8,
        status: "Pending",
      })
      .select("candidate_id")
      .single();
    expect(splitSourceError).toBeNull();
    const splitSourceId = splitSource!.candidate_id;

    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(userResult.user!.email!);
    await passwordForm.locator('input[name="password"]').fill("CandidateTest7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto(`/projects/${projectId}/interactions/${interactionId}`);

    const splitCard = page.locator("li", { has: page.locator(`input[type="hidden"][value="${splitSourceId}"]`) });
    await splitCard.getByText("Split into multiple").click();
    await expect(splitCard.locator('textarea[name="statements"]')).toBeVisible();
    await splitCard.locator('textarea[name="statements"]').fill("Set up CI\nWrite onboarding docs");
    await splitCard.getByRole("button", { name: "Split" }).click();
    await expect(page.getByText("Write onboarding docs")).toBeVisible();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let afterSplit: any[] = [];
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("extraction_candidate")
            .select("candidate_id, status, statement, candidate_type, split_from_candidate_id, split_into_candidate_ids")
            .eq("interaction_id", interactionId);
          afterSplit = data ?? [];
          return afterSplit.find((c) => c.candidate_id === splitSourceId)?.status;
        },
        { timeout: 10000 }
      )
      .toBe("Split");

    const splitOriginal = afterSplit!.find((c) => c.candidate_id === splitSourceId)!;
    expect(splitOriginal.status).toBe("Split");
    expect(splitOriginal.split_into_candidate_ids).toHaveLength(2);

    const splitChildren = afterSplit!.filter((c) => c.split_from_candidate_id === splitSourceId);
    expect(splitChildren).toHaveLength(2);
    expect(splitChildren.map((c) => c.statement).sort()).toEqual(["Set up CI", "Write onboarding docs"]);
    expect(splitChildren.every((c) => c.status === "Pending" && c.candidate_type === "ActionItem")).toBe(true);
    expect(new Set(splitOriginal.split_into_candidate_ids)).toEqual(new Set(splitChildren.map((c) => c.candidate_id)));
  } finally {
    await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
