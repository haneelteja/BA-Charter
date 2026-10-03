import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { embedText, resolveProjectEmbeddingModel } from "@/lib/ai/embeddings";
import type { JobPayloadMap } from "@/lib/jobs/types";

const TABLE_BY_TYPE = {
  Utterance: { table: "utterance", idColumn: "utterance_id" },
  Decision: { table: "decision", idColumn: "decision_id" },
  KnowledgeNode: { table: "knowledge_node", idColumn: "knowledge_node_id" },
  UserStory: { table: "user_story", idColumn: "user_story_id" },
} as const;

async function loadEmbeddableText(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  objectType: JobPayloadMap["embed_object"]["objectType"],
  objectId: string
): Promise<string | null> {
  switch (objectType) {
    case "Utterance": {
      const { data } = await supabase.from("utterance").select("content").eq("utterance_id", objectId).single();
      return data?.content ?? null;
    }
    case "Decision": {
      const { data } = await supabase.from("decision").select("statement").eq("decision_id", objectId).single();
      return data?.statement ?? null;
    }
    case "KnowledgeNode": {
      const { data } = await supabase
        .from("knowledge_node")
        .select("title, body")
        .eq("knowledge_node_id", objectId)
        .single();
      return data ? `${data.title}${data.body ? `: ${data.body}` : ""}` : null;
    }
    case "UserStory": {
      const { data } = await supabase
        .from("user_story")
        .select("title, description")
        .eq("user_story_id", objectId)
        .single();
      return data ? `${data.title}${data.description ? `: ${data.description}` : ""}` : null;
    }
  }
}

/**
 * Re-embedding on edit (EPIC 10's "versioned content must stay searchable
 * against its current version") is just this same job enqueued again by
 * the write path on every update, not a separate code path — the embedding
 * column is always overwritten with the current text, never appended to.
 */
export async function handleEmbedObject(payload: JobPayloadMap["embed_object"]): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { objectType, objectId, projectId, userId } = payload;

  const text = await loadEmbeddableText(supabase, objectType, objectId);
  if (!text) {
    return;
  }

  const model = await resolveProjectEmbeddingModel(projectId, userId);
  const embedding = await embedText(model, text);

  const { table, idColumn } = TABLE_BY_TYPE[objectType];
  const { error } = await supabase
    .from(table)
    .update({ embedding })
    .eq(idColumn, objectId);

  if (error) {
    throw new Error(`Failed to store embedding for ${objectType} ${objectId}: ${error.message}`);
  }
}
