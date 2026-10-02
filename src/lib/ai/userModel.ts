import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptSecret } from "@/lib/crypto";

export const SUPPORTED_PROVIDERS = ["openai", "anthropic"] as const;
export type LlmProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Resolves the calling user's configured LLM (EXECUTION_PLAN.md §3.C — BYOK,
 * not a hardcoded platform provider). Every AI call site in EPIC 4/9/10/12
 * should go through this instead of importing a provider package directly,
 * so none of them need to branch on vendor.
 */
export async function resolveUserLanguageModel(userId: string): Promise<LanguageModel> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("user_llm_setting")
    .select("provider, model, api_key_ciphertext")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load LLM settings: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "No LLM provider configured. Add your provider, model and API key in Settings before running an AI action."
    );
  }

  const apiKey = decryptSecret(data.api_key_ciphertext);

  switch (data.provider as LlmProvider) {
    case "openai":
      return createOpenAI({ apiKey })(data.model);
    case "anthropic":
      return createAnthropic({ apiKey })(data.model);
    default:
      throw new Error(`Unsupported provider: ${data.provider}`);
  }
}
