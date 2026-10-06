import type { JobType, JobPayloadMap } from "@/lib/jobs/types";
import { handleExtractCandidates } from "./handlers/extractCandidates";
import { handlePromoteProvisionalDecisions } from "./handlers/promoteProvisionalDecisions";
import { handleSweepActionItemOverdue } from "./handlers/sweepActionItemOverdue";
import { handleSweepClarificationAgeing } from "./handlers/sweepClarificationAgeing";
import { handleEmbedObject } from "./handlers/embedObject";
import { handleRetentionPurge } from "./handlers/retentionPurge";

type Handler = (payload: unknown) => Promise<void>;

export const handlers: Record<JobType, Handler> = {
  extract_candidates: (payload) =>
    handleExtractCandidates(payload as JobPayloadMap["extract_candidates"]),
  promote_provisional_decisions: (payload) =>
    handlePromoteProvisionalDecisions(payload as JobPayloadMap["promote_provisional_decisions"]),
  sweep_action_item_overdue: () => handleSweepActionItemOverdue(),
  sweep_clarification_ageing: () => handleSweepClarificationAgeing(),
  embed_object: (payload) => handleEmbedObject(payload as JobPayloadMap["embed_object"]),
  retention_purge: () => handleRetentionPurge(),
};
