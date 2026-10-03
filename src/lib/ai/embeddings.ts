import { createOpenAI } from "@ai-sdk/openai";
import { embed, type EmbeddingModel } from "ai";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptSecret } from "@/lib/crypto";

/**
 * A project's embedding model is fixed at project level so vectors stay
 * comparable regardless of who wrote the content (EXECUTION_PLAN.md §3.C),
 * but actually calling the embeddings API still needs a real credential —
 * borrowed from the acting user's own BYOK setting. Their configured
 * provider must match the project's embedding_provider (both must be
 * openai or openrouter; Anthropic has no embeddings endpoint), otherwise
 * this throws rather than silently embedding with the wrong key/endpoint.
 */
export async function resolveProjectEmbeddingModel(
  projectId: string,
  actingUserId: string
): Promise<EmbeddingModel> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: project, error: projectError } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();
  if (projectError) {
    throw new Error(`Failed to load project: ${projectError.message}`);
  }
  if (!project.embedding_provider || !project.embedding_model) {
    throw new Error(
      "This project has no embedding model configured yet. A Lead BA must set one in project settings."
    );
  }

  const { data: setting, error: settingError } = await supabase
    .from("user_llm_setting")
    .select("provider, api_key_ciphertext")
    .eq("user_id", actingUserId)
    .maybeSingle();
  if (settingError) {
    throw new Error(`Failed to load LLM settings: ${settingError.message}`);
  }
  if (!setting) {
    throw new Error("No LLM provider configured. Add one in Settings before running an AI action.");
  }
  if (setting.provider !== project.embedding_provider) {
    throw new Error(
      `This project embeds with "${project.embedding_provider}", but your configured provider is "${setting.provider}". Add a matching provider in Settings.`
    );
  }

  const apiKey = decryptSecret(setting.api_key_ciphertext);
  const baseURL =
    project.embedding_provider === "openrouter" ? "https://openrouter.ai/api/v1" : undefined;

  return createOpenAI({ apiKey, baseURL }).textEmbeddingModel(project.embedding_model);
}

export async function embedText(model: EmbeddingModel, text: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: text });
  return embedding;
}
