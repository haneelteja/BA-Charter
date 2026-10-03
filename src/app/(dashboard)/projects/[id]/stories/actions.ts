"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";
import { evaluateGuardrails, type GuardrailFinding, type GuardrailRule } from "@/lib/ai/guardrails";
import { checkDuplicateStories, type DuplicateMatch } from "@/lib/ai/duplicateCheck";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { getAgileStudioClient } from "@/lib/agileStudio/client";

const EDITABLE_STATUSES = ["Draft", "GuardrailCheck", "ReturnedForRework"];

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

function storyText(story: {
  title: string;
  actor: string | null;
  goal: string | null;
  description: string | null;
}): string {
  return [story.title, story.actor, story.goal, story.description].filter(Boolean).join(" — ");
}

/** §3.6 stage 1. */
export async function createUserStory(projectId: string, formData: FormData) {
  const epicId = String(formData.get("epic_id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const actor = String(formData.get("actor") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  const businessValue = String(formData.get("business_value") ?? "").trim();
  const startingPoint = String(formData.get("starting_point") ?? "").trim();
  const endPoint = String(formData.get("end_point") ?? "").trim();

  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: story, error } = await supabase
    .from("user_story")
    .insert({
      project_id: projectId,
      epic_id: epicId,
      title,
      actor: actor || null,
      goal: goal || null,
      business_value: businessValue || null,
      starting_point: startingPoint || null,
      end_point: endPoint || null,
      status: "Draft",
      created_by: user.id,
    })
    .select("user_story_id")
    .single();
  if (error) throw new Error(`Failed to create user story: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "UserStory",
    targetObjectId: story.user_story_id,
    newValue: { title },
  });

  redirect(`/projects/${projectId}/stories/${story.user_story_id}`);
}

/** §3.6 stage 2. */
export async function updateStoryDetail(projectId: string, storyId: string, formData: FormData) {
  const prerequisites = String(formData.get("prerequisites") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assumptions = String(formData.get("assumptions") ?? "").trim();
  const exclusions = String(formData.get("exclusions") ?? "").trim();
  const nfrPerformance = String(formData.get("nfr_performance") ?? "").trim();
  const nfrSecurity = String(formData.get("nfr_security") ?? "").trim();
  const nfrAccessibility = String(formData.get("nfr_accessibility") ?? "").trim();
  const nfrAudit = String(formData.get("nfr_audit") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: prior, error: fetchError } = await supabase
    .from("user_story")
    .select("status, version_no, title, actor, goal")
    .eq("user_story_id", storyId)
    .single();
  if (fetchError) throw new Error(`Failed to load story: ${fetchError.message}`);
  if (!EDITABLE_STATUSES.includes(prior.status)) {
    throw new Error(`Cannot edit a story in status ${prior.status}.`);
  }

  const { error } = await supabase
    .from("user_story")
    .update({
      prerequisites: prerequisites || null,
      description: description || null,
      assumptions: assumptions || null,
      exclusions: exclusions || null,
      nfr_performance: nfrPerformance || null,
      nfr_security: nfrSecurity || null,
      nfr_accessibility: nfrAccessibility || null,
      nfr_audit: nfrAudit || null,
      version_no: prior.version_no + 1,
    })
    .eq("user_story_id", storyId);
  if (error) throw new Error(`Failed to update story: ${error.message}`);

  await enqueueEmbedding(supabase, projectId, "UserStory", storyId, user.id);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

export async function addAcceptanceCriterion(projectId: string, storyId: string, formData: FormData) {
  const givenClause = String(formData.get("given_clause") ?? "").trim();
  const whenClause = String(formData.get("when_clause") ?? "").trim();
  const thenClause = String(formData.get("then_clause") ?? "").trim();
  const isNegativePath = formData.get("is_negative_path") === "on";

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { count } = await supabase
    .from("acceptance_criterion")
    .select("criterion_id", { count: "exact", head: true })
    .eq("user_story_id", storyId);

  const { error } = await supabase.from("acceptance_criterion").insert({
    user_story_id: storyId,
    sequence_no: count ?? 0,
    given_clause: givenClause || null,
    when_clause: whenClause || null,
    then_clause: thenClause || null,
    is_negative_path: isNegativePath,
  });
  if (error) throw new Error(`Failed to add acceptance criterion: ${error.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

export async function deleteAcceptanceCriterion(projectId: string, storyId: string, formData: FormData) {
  const criterionId = String(formData.get("criterion_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("acceptance_criterion").delete().eq("criterion_id", criterionId);
  if (error) throw new Error(`Failed to delete acceptance criterion: ${error.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

export async function addDependency(projectId: string, storyId: string, formData: FormData) {
  const dependsOnStoryId = String(formData.get("depends_on_story_id") ?? "");
  const dependencyType = String(formData.get("dependency_type") ?? "RelatesTo");

  if (!dependsOnStoryId || dependsOnStoryId === storyId) {
    throw new Error("Invalid dependency target.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("story_dependency").insert({
    user_story_id: storyId,
    depends_on_story_id: dependsOnStoryId,
    dependency_type: dependencyType,
  });
  if (error) throw new Error(`Failed to add dependency: ${error.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

export async function removeDependency(projectId: string, storyId: string, formData: FormData) {
  const dependencyId = String(formData.get("dependency_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("story_dependency").delete().eq("dependency_id", dependencyId);
  if (error) throw new Error(`Failed to remove dependency: ${error.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

export interface StoryCheckResult {
  findings: GuardrailFinding[];
  duplicates: DuplicateMatch[];
  passed: boolean;
}

/**
 * §3.6 stage 3: guardrail evaluation (EPIC 9) + duplicate detection
 * (EPIC 10) in one pass. Persists guardrail_pass so submitForReview can
 * gate on it without re-running the check.
 */
export async function runStoryCheck(projectId: string, storyId: string): Promise<StoryCheckResult> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: story, error: storyError } = await supabase
    .from("user_story")
    .select("*")
    .eq("user_story_id", storyId)
    .single();
  if (storyError) throw new Error(`Failed to load story: ${storyError.message}`);

  const [{ data: criteria }, { data: glossary }, { data: rules }] = await Promise.all([
    supabase.from("acceptance_criterion").select("*").eq("user_story_id", storyId),
    supabase.from("glossary_term").select("term, preferred_form, banned_forms").eq("project_id", projectId),
    supabase
      .from("guardrail_rule")
      .select("rule_type, rule_name, rule_expression, severity")
      .eq("project_id", projectId)
      .eq("is_active", true),
  ]);

  const acCount = criteria?.length ?? 0;
  const negativePathCount = (criteria ?? []).filter((c) => c.is_negative_path).length;
  const description = [
    story.description,
    acCount === 0 ? "(no acceptance criteria defined)" : null,
    negativePathCount === 0 ? "(no negative-path acceptance criteria defined)" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const model = await resolveUserLanguageModel(user.id);

  const findings = await evaluateGuardrails(
    model,
    {
      title: story.title,
      actor: story.actor,
      goal: story.goal,
      businessValue: story.business_value,
      description,
      acceptanceCriteria: (criteria ?? [])
        .map((c) => `Given ${c.given_clause}, When ${c.when_clause}, Then ${c.then_clause}`)
        .join("; "),
    },
    (glossary ?? []).map((g) => ({ term: g.term, preferredForm: g.preferred_form, bannedForms: g.banned_forms })),
    (rules ?? []).map((r) => ({
      ruleType: r.rule_type as GuardrailRule["ruleType"],
      ruleName: r.rule_name,
      ruleExpression: r.rule_expression,
      severity: r.severity as GuardrailRule["severity"],
    }))
  );

  const duplicates = await checkDuplicateStories(supabase, projectId, user.id, storyId, storyText(story));

  const passed = !findings.some((f) => f.severity === "Blocking");

  const { error: updateError } = await supabase
    .from("user_story")
    .update({ guardrail_pass: passed, status: story.status === "Draft" ? "GuardrailCheck" : story.status })
    .eq("user_story_id", storyId);
  if (updateError) throw new Error(`Failed to save check result: ${updateError.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);

  return { findings, duplicates, passed };
}

/** §3.6 stage 3 -> 4. */
export async function submitStoryForReview(projectId: string, storyId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: story, error: fetchError } = await supabase
    .from("user_story")
    .select("status, guardrail_pass")
    .eq("user_story_id", storyId)
    .single();
  if (fetchError) throw new Error(`Failed to load story: ${fetchError.message}`);
  if (!story.guardrail_pass) {
    throw new Error("Run the guardrail check and resolve any blocking findings first.");
  }

  const { error } = await supabase
    .from("user_story")
    .update({ status: "InReview" })
    .eq("user_story_id", storyId)
    .in("status", EDITABLE_STATUSES);
  if (error) throw new Error(`Failed to submit for review: ${error.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "StatusChanged",
    targetObjectType: "UserStory",
    targetObjectId: storyId,
    newValue: { status: "InReview" },
  });

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

/** §3.6 stage 4: "Peer Business Analyst or Lead Business Analyst reviews" — any project member, not Lead-gated. */
export async function reviewStory(projectId: string, storyId: string, formData: FormData) {
  const outcome = String(formData.get("outcome") ?? "");
  const comments = String(formData.get("comments") ?? "").trim();

  if (outcome !== "Approved" && outcome !== "ReturnedForRework") {
    throw new Error("Invalid review outcome.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error: reviewError } = await supabase.from("review").insert({
    project_id: projectId,
    target_object_type: "UserStory",
    target_object_id: storyId,
    reviewer_user_id: user.id,
    outcome,
    comments: comments || null,
    reviewed_at: new Date().toISOString(),
  });
  if (reviewError) throw new Error(`Failed to record review: ${reviewError.message}`);

  const { error: updateError } = await supabase
    .from("user_story")
    .update({ status: outcome })
    .eq("user_story_id", storyId);
  if (updateError) throw new Error(`Failed to update story status: ${updateError.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

export async function linkStoryToDecision(projectId: string, storyId: string, formData: FormData) {
  const decisionId = String(formData.get("decision_id") ?? "");
  if (!decisionId) {
    throw new Error("Select a decision.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("trace_link").insert({
    project_id: projectId,
    from_object_type: "UserStory",
    from_object_id: storyId,
    to_object_type: "Decision",
    to_object_id: decisionId,
    link_type: "Implements",
  });
  if (error) throw new Error(`Failed to link decision: ${error.message}`);

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}

/** §8 rule 5: hard gate — publication blocked without a trace link to a confirmed decision. */
export async function publishStory(projectId: string, storyId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: story, error: fetchError } = await supabase
    .from("user_story")
    .select("title, status")
    .eq("user_story_id", storyId)
    .single();
  if (fetchError) throw new Error(`Failed to load story: ${fetchError.message}`);
  if (story.status !== "Approved") {
    throw new Error(`Cannot publish a story in status ${story.status}.`);
  }

  const { count } = await supabase
    .from("trace_link")
    .select("trace_link_id", { count: "exact", head: true })
    .eq("from_object_type", "UserStory")
    .eq("from_object_id", storyId)
    .eq("to_object_type", "Decision");
  if (!count) {
    throw new Error("A story cannot be published without at least one trace link to a confirmed decision.");
  }

  const { ref } = await getAgileStudioClient().publishStory({ storyId, title: story.title });

  const { error: updateError } = await supabase
    .from("user_story")
    .update({ status: "Published", agile_studio_ref: ref })
    .eq("user_story_id", storyId);
  if (updateError) throw new Error(`Failed to update story: ${updateError.message}`);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Published",
    targetObjectType: "UserStory",
    targetObjectId: storyId,
    newValue: { status: "Published", agile_studio_ref: ref },
  });

  revalidatePath(`/projects/${projectId}/stories/${storyId}`);
}
