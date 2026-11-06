import { requireEnv } from "@/lib/env";
import { getAgileStudioAccessToken } from "./oauth";
import type { AgileStudioClient } from "./client";

/**
 * NOT YET VERIFIED against a real Pega Infinity + Agile Studio instance —
 * none exists yet (EXECUTION_PLAN.md §3.E). The requirements document
 * itself assumed Agile Studio would run on the SAME Pega application as
 * this platform ("direct object reference... no synchronisation layer
 * required" — Requirements §6), so there was never a spec for what a
 * standalone REST shape should look like once split out. There's a real
 * difference in confidence between the two halves of this file:
 *
 *  - The request shape (`POST /api/v1/cases` with `caseTypeID` +
 *    `content`, `PATCH /api/v1/cases/<id>` for updates) matches Pega
 *    Platform's standard, documented case-management REST API
 *    (Constellation DX API) — this part is a reasonable starting point,
 *    not a blind guess.
 *  - The case type names and field names below (`AGILE_STUDIO_EPIC_CASE_TYPE`
 *    etc., `Title`, `SourceEpicId`/`SourceStoryId`) are genuinely
 *    org-specific — whatever case type an org's Agile Studio actually
 *    uses to represent an epic/story, and whatever field names its case
 *    type's view/data model exposes, which only exist once a real
 *    instance does. Deliberately left env-configurable rather than
 *    hardcoded so correcting them is a config change, not a code change.
 *
 * `getAgileStudioClient()` in client.ts only returns this instead of the
 * stub once `AGILE_STUDIO_BASE_URL` is actually set — no existing call
 * site changes when that happens.
 */
export class RealAgileStudioClient implements AgileStudioClient {
  private get baseUrl(): string {
    return requireEnv("AGILE_STUDIO_BASE_URL");
  }

  private get epicCaseType(): string {
    return process.env.AGILE_STUDIO_EPIC_CASE_TYPE ?? "AgileStudio-Work-Epic";
  }

  private get storyCaseType(): string {
    return process.env.AGILE_STUDIO_STORY_CASE_TYPE ?? "AgileStudio-Work-Story";
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const token = await getAgileStudioAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Agile Studio API request failed (${response.status} ${path}): ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async publishEpic(input: { epicId: string; title: string }): Promise<{ ref: string }> {
    const data = (await this.request("/api/v1/cases", {
      method: "POST",
      body: JSON.stringify({
        caseTypeID: this.epicCaseType,
        content: { Title: input.title, SourceEpicId: input.epicId },
      }),
    })) as { ID: string };
    return { ref: data.ID };
  }

  async publishStory(input: { storyId: string; title: string }): Promise<{ ref: string }> {
    const data = (await this.request("/api/v1/cases", {
      method: "POST",
      body: JSON.stringify({
        caseTypeID: this.storyCaseType,
        content: { Title: input.title, SourceStoryId: input.storyId },
      }),
    })) as { ID: string };
    return { ref: data.ID };
  }

  /** §8 rule 6: never writes sprint/status/points — intentionally no fields for them in this body. */
  async updateEpic(input: { epicId: string; ref: string }): Promise<void> {
    await this.request(`/api/v1/cases/${encodeURIComponent(input.ref)}`, {
      method: "PATCH",
      body: JSON.stringify({ content: { SourceEpicId: input.epicId } }),
    });
  }

  async updateStory(input: { storyId: string; ref: string }): Promise<void> {
    await this.request(`/api/v1/cases/${encodeURIComponent(input.ref)}`, {
      method: "PATCH",
      body: JSON.stringify({ content: { SourceStoryId: input.storyId } }),
    });
  }
}
