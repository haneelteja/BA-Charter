import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, resolveProjectEmbeddingModel } from "./embeddings";

export interface RetrievalResult {
  object_type: string;
  object_id: string;
  snippet: string;
  relevance_score: number;
  source_utterance_id: string | null;
}

const ALL_SCOPES = ["Utterance", "Decision", "KnowledgeNode", "UserStory"] as const;
export type RetrievalScope = (typeof ALL_SCOPES)[number];

/** /retrieval/search equivalent — embeds the query with the project's fixed embedding model, then ranks across every enabled object type in one query. */
export async function searchProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  query: string,
  scope: RetrievalScope[],
  limit = 10
): Promise<RetrievalResult[]> {
  const model = await resolveProjectEmbeddingModel(projectId, userId);
  const embedding = await embedText(model, query);

  const { data, error } = await supabase.rpc("search_project_embeddings", {
    p_project_id: projectId,
    p_query_embedding: JSON.stringify(embedding),
    p_scope: scope,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  return data ?? [];
}

export { ALL_SCOPES };
