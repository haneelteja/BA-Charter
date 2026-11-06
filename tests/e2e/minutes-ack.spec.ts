import { randomBytes } from "crypto";
import { expect, test } from "@playwright/test";
import { deleteTestProject, getAdminClient } from "./helpers/supabase-admin";

/**
 * Covers the public tokenized minutes ack/dispute page (EPIC 5 follow-up):
 * an external recipient with no app account can open /minutes/[token] and
 * either acknowledge, or dispute and have the dispute revert the committed
 * decision + reopen the interaction — identical outcome to the
 * authenticated in-app dispute action, since both share
 * src/lib/minutes/dispute.ts.
 *
 * Sets up the state directly via the admin client (project, interaction,
 * a committed Provisional decision, a distributed minutes_document) rather
 * than driving the full Meeting Ingestion UI flow end to end — the UI path
 * to get here is already exercised implicitly elsewhere; what's new and
 * worth testing here is the public page and its two actions.
 */
test("the public minutes-ack link lets an external recipient acknowledge, then dispute and revert the decision", async ({
  page,
}) => {
  const admin = getAdminClient();
  const { data: userResult, error: createErr } = await admin.auth.admin.createUser({
    email: `e2e-minutes-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "MinutesAckTest7!",
    email_confirm: true,
  });
  expect(createErr).toBeNull();
  const leadUserId = userResult!.user!.id;

  let projectId: string | undefined;
  const recipientEmail = "external-stakeholder@example.com";
  const ackToken = randomBytes(32).toString("base64url");

  try {
    const { data: project, error: projectError } = await admin
      .from("project")
      .insert({ project_name: `E2E Minutes Ack Project ${Date.now()}`, status: "Active", lead_ba_id: leadUserId })
      .select("project_id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.project_id;
    await admin.from("project_member").insert({ project_id: projectId, user_id: leadUserId, role_name: "LeadBA" });

    const { data: interaction, error: interactionError } = await admin
      .from("interaction")
      .insert({ project_id: projectId, source_type: "ManualNote", title: "E2E kickoff call", processing_status: "Confirmed" })
      .select("interaction_id")
      .single();
    expect(interactionError).toBeNull();
    const interactionId = interaction!.interaction_id;

    const { data: decision, error: decisionError } = await admin
      .from("decision")
      .insert({ project_id: projectId, statement: "We will use Postgres.", status: "Provisional" })
      .select("decision_id")
      .single();
    expect(decisionError).toBeNull();
    const decisionId = decision!.decision_id;

    const { data: candidate, error: candidateError } = await admin
      .from("extraction_candidate")
      .insert({
        project_id: projectId,
        interaction_id: interactionId,
        candidate_type: "Decision",
        statement: "We will use Postgres.",
        confidence_score: 0.9,
        status: "Accepted",
        resulting_object_type: "Decision",
        resulting_object_id: decisionId,
      })
      .select("candidate_id")
      .single();
    expect(candidateError).toBeNull();

    const { data: minutes, error: minutesError } = await admin
      .from("minutes_document")
      .insert({
        project_id: projectId,
        interaction_id: interactionId,
        subject: "Kickoff call minutes",
        body_html: "<p>We will use Postgres.</p>",
        status: "Distributed",
        distributed_at: new Date().toISOString(),
      })
      .select("minutes_id")
      .single();
    expect(minutesError).toBeNull();
    const minutesId = minutes!.minutes_id;

    const { error: recipientError } = await admin
      .from("minutes_recipient")
      .insert({ minutes_id: minutesId, email: recipientEmail, ack_token: ackToken });
    expect(recipientError).toBeNull();

    // No sign-in at all — this is the whole point of the public link.
    await page.goto(`/minutes/${ackToken}`);
    await expect(page.getByText("Kickoff call minutes")).toBeVisible();
    await expect(page.getByText(recipientEmail)).toBeVisible();
    await expect(page.getByText("We will use Postgres.").first()).toBeVisible();

    await page.getByRole("button", { name: "Acknowledge" }).click();
    await expect(page.getByText(/Acknowledged on/)).toBeVisible();

    const { data: ackedRecipient } = await admin
      .from("minutes_recipient")
      .select("acknowledged_at")
      .eq("minutes_id", minutesId)
      .single();
    expect(ackedRecipient?.acknowledged_at).not.toBeNull();

    // Now dispute — should revert the decision and reopen the interaction,
    // same outcome the authenticated in-app dispute action produces.
    await page.fill("#dispute_note", "Postgres wasn't actually agreed — please re-check.");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Disputed")).toBeVisible();

    const { data: updatedMinutes } = await admin
      .from("minutes_document")
      .select("status, dispute_note")
      .eq("minutes_id", minutesId)
      .single();
    expect(updatedMinutes).toMatchObject({ status: "Disputed" });

    const { data: updatedDecision } = await admin
      .from("decision")
      .select("status")
      .eq("decision_id", decisionId)
      .single();
    expect(updatedDecision?.status).toBe("Candidate");

    const { data: updatedCandidate } = await admin
      .from("extraction_candidate")
      .select("status, resulting_object_id")
      .eq("candidate_id", candidate!.candidate_id)
      .single();
    expect(updatedCandidate).toMatchObject({ status: "Pending", resulting_object_id: null });

    const { data: updatedInteraction } = await admin
      .from("interaction")
      .select("processing_status")
      .eq("interaction_id", interactionId)
      .single();
    expect(updatedInteraction?.processing_status).toBe("Extracted");

    const { data: disputedRecipient } = await admin
      .from("minutes_recipient")
      .select("disputed_at")
      .eq("minutes_id", minutesId)
      .single();
    expect(disputedRecipient?.disputed_at).not.toBeNull();
  } finally {
    if (projectId) await deleteTestProject(projectId);
    await admin.auth.admin.deleteUser(leadUserId);
  }
});

test("an invalid token shows a clear message instead of leaking any data", async ({ page }) => {
  await page.goto(`/minutes/${randomBytes(32).toString("base64url")}`);
  await expect(page.getByText("This link is invalid or has expired.")).toBeVisible();
});
