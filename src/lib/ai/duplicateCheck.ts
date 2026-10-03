import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, resolveProjectEmbeddingModel } from "./embeddings";

export interface DuplicateMatch {
  userStoryId: string;
  title: string;
  similarityScore: number;
}

const SIMILARITY_THRESHOLD = 0.85;

/**
 * /analysis/duplicate-check equivalent, built on EPIC 10's retrieval
 * function rather than a separate search. Returns [] (not an error) when
 * the project has no embedding model configured, or when the story being
 * checked hasn't been embedded yet (embedding runs async via the job
 * queue, so a check run immediately after editing may not see it) — in
 * both cases the honest answer is "nothing to compare against yet", not a
 * failure.
 */
export async function checkDuplicateStories(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  storyId: string,
  storyText: string
): Promise<DuplicateMatch[]> {
  const { data: project } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();

  if (!project?.embedding_provider || !project?.embedding_model) {
    return [];
  }

  const model = await resolveProjectEmbeddingModel(projectId, userId);
  const embedding = await embedText(model, storyText);

  const { data, error } = await supabase.rpc("search_project_embeddings", {
    p_project_id: projectId,
    p_query_embedding: JSON.stringify(embedding),
    p_scope: ["UserStory"],
    p_limit: 10,
  });

  if (error) {
    throw new Error(`Duplicate check failed: ${error.message}`);
  }

  const matches = (data ?? []).filter(
    (r: { object_id: string; relevance_score: number }) =>
      r.object_id !== storyId && r.relevance_score >= SIMILARITY_THRESHOLD
  );

  if (matches.length === 0) return [];

  const ids = matches.map((m: { object_id: string }) => m.object_id);
  const { data: stories } = await supabase.from("user_story").select("user_story_id, title").in("user_story_id", ids);

  return matches.map((m: { object_id: string; relevance_score: number }) => ({
    userStoryId: m.object_id,
    title: (stories ?? []).find((s) => s.user_story_id === m.object_id)?.title ?? "(unknown)",
    similarityScore: m.relevance_score,
  }));
}
