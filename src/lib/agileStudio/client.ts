/**
 * EPIC 14 slice, built early (stubbed) so EPIC 8/11 Publish steps aren't
 * blocked (EXECUTION_PLAN.md §3.E — no real Pega Infinity + Agile Studio
 * instance exists yet). Same interface a real REST client will implement
 * later (resurrecting the OAuth2 client-credentials pattern from
 * src/lib/pega/* before the Pega pivot) — call sites never change, only
 * this file's internals do.
 */
export interface AgileStudioClient {
  publishEpic(input: { epicId: string; title: string }): Promise<{ ref: string }>;
  publishStory(input: { storyId: string; title: string }): Promise<{ ref: string }>;
}

class StubAgileStudioClient implements AgileStudioClient {
  async publishEpic(input: { epicId: string; title: string }): Promise<{ ref: string }> {
    return { ref: `STUB-EPIC-${input.epicId.slice(0, 8)}` };
  }

  async publishStory(input: { storyId: string; title: string }): Promise<{ ref: string }> {
    return { ref: `STUB-STORY-${input.storyId.slice(0, 8)}` };
  }
}

export function getAgileStudioClient(): AgileStudioClient {
  return new StubAgileStudioClient();
}
