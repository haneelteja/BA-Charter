import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/enqueue";
import type { JobPayloadMap } from "@/lib/jobs/types";

type ObjectType = JobPayloadMap["embed_object"]["objectType"];

const DIRECT_TABLES: { objectType: ObjectType; table: string; idColumn: string }[] = [
  { objectType: "Decision", table: "decision", idColumn: "decision_id" },
  { objectType: "KnowledgeNode", table: "knowledge_node", idColumn: "knowledge_node_id" },
  { objectType: "UserStory", table: "user_story", idColumn: "user_story_id" },
  { objectType: "Epic", table: "epic", idColumn: "epic_id" },
  { objectType: "ActionItem", table: "action_item", idColumn: "action_item_id" },
  { objectType: "Clarification", table: "clarification", idColumn: "clarification_id" },
  { objectType: "ChangeRequest", table: "change_request", idColumn: "change_request_id" },
  { objectType: "Guardrail", table: "guardrail_rule", idColumn: "rule_id" },
  { objectType: "Document", table: "project_document", idColumn: "document_id" },
];

/**
 * Called once, right after a Lead BA sets (or changes) a project's
 * embedding model. enqueueEmbedding no-ops on every write made before a
 * project has a model configured (EPIC 10 — embeddings are a progressive
 * enhancement, not a hard requirement to use the rest of the app), so
 * anything created before that point would otherwise never become
 * searchable or answerable in chat. This walks every embeddable table for
 * rows still missing an embedding and enqueues the same `embed_object` job
 * every live write already uses.
 */
export async function enqueueBackfillEmbeddings(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<number> {
  let count = 0;

  for (const { objectType, table, idColumn } of DIRECT_TABLES) {
    const { data } = await supabase
      .from(table)
      .select(idColumn)
      .eq("project_id", projectId)
      .is("embedding", null);

    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      await enqueueJob("embed_object", { projectId, objectType, objectId: row[idColumn], userId });
      count++;
    }
  }

  // utterance has no direct project_id column — reached via interaction.
  const { data: utterances } = await supabase
    .from("utterance")
    .select("utterance_id, interaction:interaction_id!inner(project_id)")
    .eq("interaction.project_id", projectId)
    .is("embedding", null);

  for (const row of utterances ?? []) {
    await enqueueJob("embed_object", { projectId, objectType: "Utterance", objectId: row.utterance_id, userId });
    count++;
  }

  return count;
}
