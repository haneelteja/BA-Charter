"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole, isLead } from "@/lib/projects/role";

/**
 * Embedding model is fixed at project level (EXECUTION_PLAN.md §3.C) —
 * Lead-BA gated since it affects every member's retrieval results, not
 * just the person configuring it.
 */
export async function setEmbeddingConfig(projectId: string, formData: FormData) {
  const provider = String(formData.get("embedding_provider") ?? "");
  const model = String(formData.get("embedding_model") ?? "").trim();

  if (provider !== "openai" && provider !== "openrouter") {
    throw new Error("Embedding provider must be openai or openrouter (Anthropic has no embeddings endpoint).");
  }
  if (!model) {
    throw new Error("Embedding model is required.");
  }

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }

  const role = await getProjectRole(supabase, projectId, auth.user.id);
  if (!isLead(role)) {
    throw new Error("Only a Lead Business Analyst can change the embedding model.");
  }

  const { error } = await supabase
    .from("project")
    .update({ embedding_provider: provider, embedding_model: model })
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to update embedding settings: ${error.message}`);
  }

  revalidatePath(`/projects/${projectId}`);
}
