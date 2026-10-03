import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/enqueue";
import type { JobPayloadMap } from "@/lib/jobs/types";

/**
 * Called from every write point that creates/updates embeddable content
 * (utterance, decision, knowledge_node, user_story). Skips enqueueing
 * entirely if the project has no embedding model configured yet, so an
 * unconfigured project doesn't fill the job queue with doomed jobs —
 * embeddings are a progressive enhancement, not a hard requirement to use
 * the rest of the app.
 */
export async function enqueueEmbedding(
  supabase: SupabaseClient,
  projectId: string,
  objectType: JobPayloadMap["embed_object"]["objectType"],
  objectId: string,
  userId: string
): Promise<void> {
  const { data: project } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();

  if (!project?.embedding_provider || !project?.embedding_model) {
    return;
  }

  await enqueueJob("embed_object", { projectId, objectType, objectId, userId });
}
