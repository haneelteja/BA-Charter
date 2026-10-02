import type { JobType } from "@/lib/jobs/types";

// Keyed as `unknown` rather than each job's specific payload type: the
// worker reads `payload` back from Postgres as `unknown` (it doesn't trust
// the DB's jsonb column to match the TS shape at compile time), so each
// handler implementation validates/casts its own payload once it has real
// logic. Keeps the registry map simple instead of fighting a mapped
// conditional type for a dispatch table that's all stubs today anyway.
type Handler = (payload: unknown) => Promise<void>;

function notImplemented(jobType: JobType): Handler {
  return async () => {
    throw new Error(
      `Handler for "${jobType}" is not implemented yet — it belongs to a later phase (see docs/EXECUTION_PLAN.md).`
    );
  };
}

// Each stub below is replaced with real logic as its owning epic lands:
// extract_candidates/generate_minutes -> EPIC 4, embed_object -> EPIC 10,
// the two sweeps -> EPIC 6/7, promote_provisional_decisions -> EPIC 5,
// retention_purge -> EPIC 17. Registering them here now (even as stubs)
// means the queue/worker plumbing is exercised end-to-end from Phase 0.
export const handlers: Record<JobType, Handler> = {
  extract_candidates: notImplemented("extract_candidates"),
  generate_minutes: notImplemented("generate_minutes"),
  embed_object: notImplemented("embed_object"),
  sweep_action_item_overdue: notImplemented("sweep_action_item_overdue"),
  sweep_clarification_ageing: notImplemented("sweep_clarification_ageing"),
  promote_provisional_decisions: notImplemented("promote_provisional_decisions"),
  retention_purge: notImplemented("retention_purge"),
};
