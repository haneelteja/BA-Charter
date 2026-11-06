import { RealAgileStudioClient } from "./restClient";

/**
 * EPIC 14 slice, built early (stubbed) so EPIC 8/11 Publish steps aren't
 * blocked (EXECUTION_PLAN.md §3.E — no real Pega Infinity + Agile Studio
 * instance existed yet). restClient.ts now has a real OAuth2
 * client-credentials REST implementation, not yet verified against an
 * actual instance (see that file's header) — getAgileStudioClient()
 * switches to it automatically once AGILE_STUDIO_BASE_URL is configured,
 * with no call-site changes needed either way.
 */
export interface AgileStudioClient {
  publishEpic(input: { epicId: string; title: string }): Promise<{ ref: string }>;
  publishStory(input: { storyId: string; title: string }): Promise<{ ref: string }>;
  /** EPIC 12 Propagate stage: pushes an already-approved edit. Never touches sprint/status/points (§8 rule 6) — those fields aren't part of this call's input. */
  updateEpic(input: { epicId: string; ref: string }): Promise<void>;
  updateStory(input: { storyId: string; ref: string }): Promise<void>;
}

class StubAgileStudioClient implements AgileStudioClient {
  async publishEpic(input: { epicId: string; title: string }): Promise<{ ref: string }> {
    return { ref: `STUB-EPIC-${input.epicId.slice(0, 8)}` };
  }

  async publishStory(input: { storyId: string; title: string }): Promise<{ ref: string }> {
    return { ref: `STUB-STORY-${input.storyId.slice(0, 8)}` };
  }

  async updateEpic(): Promise<void> {
    // Stub: no remote call yet (EXECUTION_PLAN.md §3.E).
  }

  async updateStory(): Promise<void> {
    // Stub: no remote call yet (EXECUTION_PLAN.md §3.E).
  }
}

export function getAgileStudioClient(): AgileStudioClient {
  if (process.env.AGILE_STUDIO_BASE_URL) {
    return new RealAgileStudioClient();
  }
  return new StubAgileStudioClient();
}
