import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * EPIC 16: automated WCAG 2.1 A/AA scan via axe-core against real,
 * data-populated pages in a real Chromium instance — not a full manual
 * audit (that still needs an actual screen reader and a human, which this
 * environment doesn't have), but axe-core mechanically covers a large
 * share of WCAG 2.1 AA success criteria (contrast, labels, ARIA
 * correctness, landmark/heading structure, focus order hints) and is the
 * same engine Lighthouke/Deque's own tooling uses.
 *
 * Seeds one of nearly every entity type so each page renders real content
 * (empty-state markup tends to hide structural issues that only show up
 * once a page has a list, a form, a status badge, etc. to render).
 */
test("every major authenticated page has no detectable WCAG 2.1 A/AA violations", async ({ page }) => {
  test.setTimeout(240_000); // scanning ~19 pages with axe-core takes longer than the 60s default
  const admin = getAdminClient();
  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "AccessibilityTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = userResult!.user!.id;

  let projectId: string | undefined;
  const violationsByPage: Record<string, string[]> = {};

  try {
    const { data: project, error: projectError } = await admin
      .from("project")
      .insert({ project_name: `E2E A11y Project ${Date.now()}`, status: "Active", lead_ba_id: userId, client_name: "Acme Co" })
      .select("project_id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.project_id;
    await admin.from("project_member").insert({ project_id: projectId, user_id: userId, role_name: "LeadBA" });

    const { data: interaction } = await admin
      .from("interaction")
      .insert({ project_id: projectId, source_type: "ManualNote", title: "Kickoff call", processing_status: "Extracted" })
      .select("interaction_id")
      .single();
    const interactionId = interaction!.interaction_id;

    await admin.from("extraction_candidate").insert({
      project_id: projectId,
      interaction_id: interactionId,
      candidate_type: "Decision",
      statement: "We will use Postgres.",
      confidence_score: 0.9,
      status: "Pending",
    });

    await admin
      .from("knowledge_node")
      .insert({ project_id: projectId, layer: "SystemOverview", title: "Overview", body: "The system is a web app.", status: "Active" });

    await admin
      .from("decision")
      .insert({ project_id: projectId, statement: "Use Postgres as the primary store.", status: "Confirmed" });

    await admin.from("action_item").insert({
      project_id: projectId,
      title: "Set up CI",
      owner_user_id: userId,
      raised_by: userId,
      status: "Open",
      due_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    });

    await admin.from("clarification").insert({
      project_id: projectId,
      question: "Which auth provider should we use?",
      audience_type: "InternalBusiness",
      chasing_user_id: userId,
      status: "Raised",
    });

    const { data: epic } = await admin
      .from("epic")
      .insert({ project_id: projectId, title: "Authentication", business_objective: "Let users sign in.", status: "Draft" })
      .select("epic_id")
      .single();
    const epicId = epic!.epic_id;

    const { data: story } = await admin
      .from("user_story")
      .insert({
        project_id: projectId,
        epic_id: epicId,
        title: "Sign in with email and password",
        actor: "User",
        goal: "sign in",
        business_value: "access the app",
        status: "Draft",
      })
      .select("user_story_id")
      .single();
    const storyId = story!.user_story_id;

    const { data: changeRequest } = await admin
      .from("change_request")
      .insert({ project_id: projectId, title: "Add SSO", description: "Customer wants SSO.", status: "Intake" })
      .select("change_request_id")
      .single();
    const changeRequestId = changeRequest!.change_request_id;

    await admin.from("glossary_term").insert({ project_id: projectId, term: "BA", definition: "Business Analyst" });
    await admin.from("guardrail_rule").insert({ project_id: projectId, rule_type: "Vocabulary", rule_name: "No jargon", severity: "Warning" });

    await admin.from("delivery_partner").insert({ project_id: projectId, name: "Acme Logistics", priority_order: 1 });

    await page.goto("/sign-in");
    const passwordForm = page.locator("form", { has: page.getByRole("button", { name: "Sign in" }) });
    await passwordForm.locator('input[name="email"]').fill(userResult!.user!.email!);
    await passwordForm.locator('input[name="password"]').fill("AccessibilityTest7!");
    await passwordForm.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    const pages: Array<[string, string]> = [
      ["Dashboard home", "/"],
      ["Project home", `/projects/${projectId}`],
      ["Charter", `/projects/${projectId}/charter`],
      ["Interactions list", `/projects/${projectId}/interactions`],
      ["Interaction detail", `/projects/${projectId}/interactions/${interactionId}`],
      ["Action items", `/projects/${projectId}/action-items`],
      ["Clarifications", `/projects/${projectId}/clarifications`],
      ["Epics list", `/projects/${projectId}/epics`],
      ["Epic detail", `/projects/${projectId}/epics/${epicId}`],
      ["Stories list", `/projects/${projectId}/stories`],
      ["Story detail", `/projects/${projectId}/stories/${storyId}`],
      ["Changes list", `/projects/${projectId}/changes`],
      ["Change detail", `/projects/${projectId}/changes/${changeRequestId}`],
      ["Guardrails", `/projects/${projectId}/guardrails`],
      ["Search", `/projects/${projectId}/search`],
      ["Delivery partners", `/projects/${projectId}/delivery`],
      ["Settings", "/settings"],
      ["Workspace", "/workspace"],
      ["Call prep", "/workspace/call-prep"],
    ];

    for (const [name, url] of pages) {
      await test.step(name, async () => {
        await page.goto(url);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        if (results.violations.length > 0) {
          violationsByPage[name] = results.violations.flatMap((v) =>
            v.nodes.map(
              (n) =>
                `[${v.impact}] ${v.id}: ${v.help}\n      target: ${n.target.join(" ")}\n      html: ${n.html}\n      data: ${JSON.stringify(n.any.map((a) => a.data))}`
            )
          );
        }
      });
    }

    if (Object.keys(violationsByPage).length > 0) {
      console.log("\n=== WCAG 2.1 A/AA violations found ===");
      for (const [pageName, violations] of Object.entries(violationsByPage)) {
        console.log(`\n${pageName}:`);
        for (const v of violations) console.log(`  - ${v}`);
      }
    }

    expect(violationsByPage, JSON.stringify(violationsByPage, null, 2)).toEqual({});
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test("public, unauthenticated pages have no detectable WCAG 2.1 A/AA violations", async ({ page }) => {
  const admin = getAdminClient();
  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-a11y-public-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "AccessibilityTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const userId = userResult!.user!.id;
  let projectId: string | undefined;
  const violationsByPage: Record<string, string[]> = {};

  try {
    const { data: project } = await admin
      .from("project")
      .insert({ project_name: `E2E A11y Public Project ${Date.now()}`, status: "Active", lead_ba_id: userId })
      .select("project_id")
      .single();
    projectId = project!.project_id;

    const { data: interaction, error: interactionError } = await admin
      .from("interaction")
      .insert({ project_id: projectId, source_type: "ManualNote", title: "Public page probe call", processing_status: "Confirmed" })
      .select("interaction_id")
      .single();
    expect(interactionError).toBeNull();

    const { data: minutes } = await admin
      .from("minutes_document")
      .insert({
        project_id: projectId,
        interaction_id: interaction!.interaction_id,
        subject: "Probe minutes",
        body_html: "<p>Decided: ship it.</p>",
        status: "Distributed",
      })
      .select("minutes_id")
      .single();

    const ackToken = `probe-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await admin
      .from("minutes_recipient")
      .insert({ minutes_id: minutes!.minutes_id, email: "stakeholder@example.com", ack_token: ackToken });

    const pages: Array<[string, string]> = [
      ["Sign in", "/sign-in"],
      ["Forgot password", "/forgot-password"],
      ["Reset password (no session)", "/reset-password"],
      ["Minutes ack (public)", `/minutes/${ackToken}`],
    ];

    for (const [name, url] of pages) {
      await test.step(name, async () => {
        await page.goto(url);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        if (results.violations.length > 0) {
          violationsByPage[name] = results.violations.flatMap((v) =>
            v.nodes.map(
              (n) =>
                `[${v.impact}] ${v.id}: ${v.help}\n      target: ${n.target.join(" ")}\n      html: ${n.html}\n      data: ${JSON.stringify(n.any.map((a) => a.data))}`
            )
          );
        }
      });
    }

    if (Object.keys(violationsByPage).length > 0) {
      console.log("\n=== WCAG 2.1 A/AA violations found (public pages) ===");
      for (const [pageName, violations] of Object.entries(violationsByPage)) {
        console.log(`\n${pageName}:`);
        for (const v of violations) console.log(`  - ${v}`);
      }
    }

    expect(violationsByPage, JSON.stringify(violationsByPage, null, 2)).toEqual({});
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(userId);
  }
});
