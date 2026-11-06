import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers merge/split on the Meeting Ingestion Confirm stage (EPIC 6
 * follow-up, explicitly deferred when it first shipped). Seeds the
 * project/interaction/candidates directly via the admin client rather
 * than driving the full extraction pipeline — what's new here is the
 * merge/split actions and their UI, not candidate generation itself.
 */
test("merging two candidates and splitting another both produce correctly linked Pending candidates", async ({
  page,
}) => {
  const admin = getAdminClient();
  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-mergesplit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "MergeSplitTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = userResult!.user!.id;

  let projectId: string | undefined;

  try {
    const { data: project, error: projectError } = await admin
      .from("project")
      .insert({ project_name: `E2E Merge Split Project ${Date.now()}`, status: "Active", lead_ba_id: userId })
      .select("project_id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.project_id;
    await admin.from("project_member").insert({ project_id: projectId, user_id: userId, role_name: "LeadBA" });

    const { data: interaction, error: interactionError } = await admin
      .from("interaction")
      .insert({ project_id: projectId, source_type: "ManualNote", title: "E2E merge/split call", processing_status: "Extracted" })
      .select("interaction_id")
      .single();
    expect(interactionError).toBeNull();
    const interactionId = interaction!.interaction_id;

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
    await passwordForm.locator('input[name="email"]').fill(userResult!.user!.email!);
    await passwordForm.locator('input[name="password"]').fill("MergeSplitTest7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await page.goto(`/projects/${projectId}/interactions/${interactionId}`);

    // Merge: check both Decision candidates, write a combined statement, submit.
    for (const c of mergeCandidates!) {
      await page.locator(`input[type="checkbox"][value="${c.candidate_id}"]`).check();
    }
    await page.fill('textarea[name="merged_statement"]', "Use Postgres as the primary data store");
    await page.getByRole("button", { name: "Merge checked candidates" }).click();
    await expect(page.getByText("Use Postgres as the primary data store")).toBeVisible();

    const { data: afterMerge } = await admin
      .from("extraction_candidate")
      .select("candidate_id, status, statement, candidate_type, confidence_score, merged_from_candidate_ids, merged_into_candidate_id")
      .eq("interaction_id", interactionId)
      .order("created_at", { ascending: true });

    const originals = afterMerge!.filter((c) => mergeCandidates!.some((m) => m.candidate_id === c.candidate_id));
    expect(originals.every((c) => c.status === "Merged")).toBe(true);
    const mergedResult = afterMerge!.find((c) => c.statement === "Use Postgres as the primary data store");
    expect(mergedResult).toMatchObject({ status: "Pending", candidate_type: "Decision" });
    expect(mergedResult!.confidence_score).toBeCloseTo(0.8, 5);
    expect(new Set(mergedResult!.merged_from_candidate_ids)).toEqual(
      new Set(mergeCandidates!.map((c) => c.candidate_id))
    );
    expect(originals.every((c) => c.merged_into_candidate_id === mergedResult!.candidate_id)).toBe(true);

    // Split: enter two lines, submit.
    const splitCard = page.locator("li", { has: page.locator(`input[type="hidden"][value="${splitSourceId}"]`) });
    await splitCard.getByText("Split into multiple").click();
    await splitCard.locator('textarea[name="statements"]').fill("Set up CI\nWrite onboarding docs");
    await splitCard.getByRole("button", { name: "Split" }).click();
    await expect(page.getByText("Write onboarding docs")).toBeVisible();

    const { data: afterSplit } = await admin
      .from("extraction_candidate")
      .select("candidate_id, status, statement, candidate_type, split_from_candidate_id, split_into_candidate_ids")
      .eq("interaction_id", interactionId);

    const splitOriginal = afterSplit!.find((c) => c.candidate_id === splitSourceId)!;
    expect(splitOriginal.status).toBe("Split");
    expect(splitOriginal.split_into_candidate_ids).toHaveLength(2);

    const splitChildren = afterSplit!.filter((c) => c.split_from_candidate_id === splitSourceId);
    expect(splitChildren).toHaveLength(2);
    expect(splitChildren.map((c) => c.statement).sort()).toEqual(["Set up CI", "Write onboarding docs"]);
    expect(splitChildren.every((c) => c.status === "Pending" && c.candidate_type === "ActionItem")).toBe(true);
    expect(new Set(splitOriginal.split_into_candidate_ids)).toEqual(new Set(splitChildren.map((c) => c.candidate_id)));
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
