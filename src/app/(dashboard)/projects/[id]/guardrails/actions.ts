"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import {
  evaluateGuardrails,
  type GuardrailFinding,
  type GuardrailRule,
  type StoryPayload,
} from "@/lib/ai/guardrails";

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

export async function createGlossaryTerm(projectId: string, formData: FormData) {
  const term = String(formData.get("term") ?? "").trim();
  const definition = String(formData.get("definition") ?? "").trim();
  const preferredForm = String(formData.get("preferred_form") ?? "").trim();
  const bannedForms = String(formData.get("banned_forms") ?? "").trim();

  if (!term) {
    throw new Error("Term is required.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("glossary_term").insert({
    project_id: projectId,
    term,
    definition: definition || null,
    preferred_form: preferredForm || null,
    banned_forms: bannedForms || null,
  });
  if (error) throw new Error(`Failed to create glossary term: ${error.message}`);

  revalidatePath(`/projects/${projectId}/guardrails`);
}

export async function deleteGlossaryTerm(projectId: string, formData: FormData) {
  const termId = String(formData.get("term_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("glossary_term").delete().eq("term_id", termId);
  if (error) throw new Error(`Failed to delete glossary term: ${error.message}`);

  revalidatePath(`/projects/${projectId}/guardrails`);
}

export async function createGuardrailRule(projectId: string, formData: FormData) {
  const ruleType = String(formData.get("rule_type") ?? "");
  const ruleName = String(formData.get("rule_name") ?? "").trim();
  const ruleExpression = String(formData.get("rule_expression") ?? "").trim();
  const severity = String(formData.get("severity") ?? "Warning");

  if (!ruleName) {
    throw new Error("Rule name is required.");
  }

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("guardrail_rule").insert({
    project_id: projectId,
    rule_type: ruleType,
    rule_name: ruleName,
    rule_expression: ruleExpression || null,
    severity,
    is_active: true,
  });
  if (error) throw new Error(`Failed to create guardrail rule: ${error.message}`);

  revalidatePath(`/projects/${projectId}/guardrails`);
}

export async function toggleGuardrailRule(projectId: string, formData: FormData) {
  const ruleId = String(formData.get("rule_id") ?? "");
  const isActive = formData.get("is_active") === "true";

  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("guardrail_rule")
    .update({ is_active: !isActive })
    .eq("rule_id", ruleId);
  if (error) throw new Error(`Failed to update guardrail rule: ${error.message}`);

  revalidatePath(`/projects/${projectId}/guardrails`);
}

export async function deleteGuardrailRule(projectId: string, formData: FormData) {
  const ruleId = String(formData.get("rule_id") ?? "");
  const supabase = await getSupabaseServerClient();
  await requireUser(supabase);

  const { error } = await supabase.from("guardrail_rule").delete().eq("rule_id", ruleId);
  if (error) throw new Error(`Failed to delete guardrail rule: ${error.message}`);

  revalidatePath(`/projects/${projectId}/guardrails`);
}

/**
 * Interactive checker — called directly from a client component (not a
 * form `action`), so it can return findings to render without a page
 * navigation. There's no user_story to persist findings against yet
 * (EPIC 11 not built); this is the engine EPIC 11's Check stage will call
 * once stories exist.
 */
export async function runGuardrailCheck(
  projectId: string,
  payload: StoryPayload
): Promise<GuardrailFinding[]> {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const [{ data: glossary, error: glossaryError }, { data: rules, error: rulesError }] = await Promise.all([
    supabase.from("glossary_term").select("term, preferred_form, banned_forms").eq("project_id", projectId),
    supabase
      .from("guardrail_rule")
      .select("rule_type, rule_name, rule_expression, severity")
      .eq("project_id", projectId)
      .eq("is_active", true),
  ]);

  if (glossaryError) throw new Error(`Failed to load glossary: ${glossaryError.message}`);
  if (rulesError) throw new Error(`Failed to load guardrail rules: ${rulesError.message}`);

  const model = await resolveUserLanguageModel(user.id);

  return evaluateGuardrails(
    model,
    payload,
    (glossary ?? []).map((g) => ({ term: g.term, preferredForm: g.preferred_form, bannedForms: g.banned_forms })),
    (rules ?? []).map((r) => ({
      ruleType: r.rule_type as GuardrailRule["ruleType"],
      ruleName: r.rule_name,
      ruleExpression: r.rule_expression,
      severity: r.severity as GuardrailRule["severity"],
    }))
  );
}
