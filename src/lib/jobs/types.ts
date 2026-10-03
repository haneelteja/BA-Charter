// Job types grow as later phases land (EPIC 10 embeddings, EPIC 6/7 sweeps,
// EPIC 17 retention). Each needs a handler registered in src/jobs/worker.ts
// before it's enqueued anywhere. Minutes generation (§3.2 stage 4) runs
// synchronously in a server action instead of through this queue — it's a
// single LLM call over already-accepted candidates, not the long-running
// per-utterance extraction pass that needs the 15-minute SLA's async budget.
export type JobType =
  | "extract_candidates"
  | "embed_object"
  | "sweep_action_item_overdue"
  | "sweep_clarification_ageing"
  | "promote_provisional_decisions"
  | "retention_purge";

export interface JobPayloadMap {
  extract_candidates: { projectId: string; interactionId: string; userId: string };
  embed_object: { projectId: string; objectType: string; objectId: string };
  sweep_action_item_overdue: Record<string, never>;
  sweep_clarification_ageing: Record<string, never>;
  promote_provisional_decisions: { projectId: string; interactionId: string; minutesId: string };
  retention_purge: Record<string, never>;
}
