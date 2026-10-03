import type { JobType, JobPayloadMap } from "@/lib/jobs/types";
import { handleExtractCandidates } from "./handlers/extractCandidates";
import { handlePromoteProvisionalDecisions } from "./handlers/promoteProvisionalDecisions";

type Handler = (payload: unknown) => Promise<void>;

function notImplemented(jobType: JobType): Handler {
  return async () => {
    throw new Error(
      `Handler for "${jobType}" is not implemented yet — it belongs to a later phase (see docs/EXECUTION_PLAN.md).`
    );
  };
}

// embed_object -> EPIC 10, the two sweeps -> EPIC 6/7, retention_purge ->
// EPIC 17: still stubs, registered so the queue/worker plumbing exercises
// every job type even before its owning epic lands.
export const handlers: Record<JobType, Handler> = {
  extract_candidates: (payload) =>
    handleExtractCandidates(payload as JobPayloadMap["extract_candidates"]),
  promote_provisional_decisions: (payload) =>
    handlePromoteProvisionalDecisions(payload as JobPayloadMap["promote_provisional_decisions"]),
  embed_object: notImplemented("embed_object"),
  sweep_action_item_overdue: notImplemented("sweep_action_item_overdue"),
  sweep_clarification_ageing: notImplemented("sweep_clarification_ageing"),
  retention_purge: notImplemented("retention_purge"),
};
