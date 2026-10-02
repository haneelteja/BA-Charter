"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { SUPPORTED_PROVIDERS, type LlmProvider } from "@/lib/ai/userModel";

export async function saveLlmSetting(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "").trim();
  const apiKey = String(formData.get("api_key") ?? "").trim();

  if (!SUPPORTED_PROVIDERS.includes(provider as LlmProvider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  if (!model) {
    throw new Error("Model is required.");
  }
  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { error } = await supabase.from("user_llm_setting").upsert({
    user_id: auth.user.id,
    provider,
    model,
    api_key_ciphertext: encryptSecret(apiKey),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to save LLM settings: ${error.message}`);
  }

  revalidatePath("/settings");
}

export async function clearLlmSetting() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const { error } = await supabase
    .from("user_llm_setting")
    .delete()
    .eq("user_id", auth.user.id);

  if (error) {
    throw new Error(`Failed to clear LLM settings: ${error.message}`);
  }

  revalidatePath("/settings");
}
