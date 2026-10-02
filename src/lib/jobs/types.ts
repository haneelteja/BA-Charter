// Job types grow as later phases land (EPIC 4 extraction, EPIC 10 embeddings,
// EPIC 5/6/7 sweeps, EPIC 17 retention). Each needs a handler registered in
// src/jobs/worker.ts before it's enqueued anywhere.
export type JobType =
  | "extract_candidates"
  | "generate_minutes"
  | "embed_object"
  | "sweep_action_item_overdue"
  | "sweep_clarification_ageing"
  | "promote_provisional_decisions"
  | "retention_purge";

export interface JobPayloadMap {
  extract_candidates: { projectId: string; interactionId: string };
  generate_minutes: { projectId: string; interactionId: string };
  embed_object: { projectId: string; objectType: string; objectId: string };
  sweep_action_item_overdue: Record<string, never>;
  sweep_clarification_ageing: Record<string, never>;
  promote_provisional_decisions: { projectId: string };
  retention_purge: Record<string, never>;
}
