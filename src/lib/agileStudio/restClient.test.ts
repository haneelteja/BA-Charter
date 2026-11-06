import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAgileStudioTokenCache } from "./oauth";
import { RealAgileStudioClient } from "./restClient";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

beforeEach(() => {
  clearAgileStudioTokenCache();
  process.env.AGILE_STUDIO_BASE_URL = "https://pega.example.com/prweb/PRRestService";
  process.env.AGILE_STUDIO_TOKEN_URL = "https://pega.example.com/prweb/PRRestService/oauth2/v1/token";
  process.env.AGILE_STUDIO_CLIENT_ID = "test-client-id";
  process.env.AGILE_STUDIO_CLIENT_SECRET = "test-client-secret";
  delete process.env.AGILE_STUDIO_EPIC_CASE_TYPE;
  delete process.env.AGILE_STUDIO_STORY_CASE_TYPE;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every test fetches a token first (call #1), then makes its own API call (call #2) — this stubs both in order. */
function stubTokenThen(apiResponse: Response) {
  const fetchMock = vi.mocked(fetch);
  fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "tok-1", expires_in: 3600 }));
  fetchMock.mockResolvedValueOnce(apiResponse);
  return fetchMock;
}

describe("RealAgileStudioClient", () => {
  it("publishEpic POSTs to /api/v1/cases with the configured case type and bearer token", async () => {
    const fetchMock = stubTokenThen(jsonResponse({ ID: "EPIC-REF-123" }));
    const client = new RealAgileStudioClient();

    const result = await client.publishEpic({ epicId: "epic-1", title: "Authentication" });

    expect(result).toEqual({ ref: "EPIC-REF-123" });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://pega.example.com/prweb/PRRestService/api/v1/cases");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(init!.body as string)).toEqual({
      caseTypeID: "AgileStudio-Work-Epic",
      content: { Title: "Authentication", SourceEpicId: "epic-1" },
    });
  });

  it("publishStory uses the story case type", async () => {
    stubTokenThen(jsonResponse({ ID: "STORY-REF-456" }));
    const client = new RealAgileStudioClient();

    const result = await client.publishStory({ storyId: "story-1", title: "Sign in" });

    expect(result).toEqual({ ref: "STORY-REF-456" });
  });

  it("honors AGILE_STUDIO_EPIC_CASE_TYPE when set", async () => {
    process.env.AGILE_STUDIO_EPIC_CASE_TYPE = "MyOrg-Work-Epic";
    const fetchMock = stubTokenThen(jsonResponse({ ID: "EPIC-REF-1" }));
    const client = new RealAgileStudioClient();

    await client.publishEpic({ epicId: "epic-1", title: "Authentication" });

    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(init!.body as string).caseTypeID).toBe("MyOrg-Work-Epic");
  });

  it("updateEpic PATCHes the case by ref and never includes sprint/status/points fields (§8 rule 6)", async () => {
    const fetchMock = stubTokenThen(jsonResponse(null, 204));
    const client = new RealAgileStudioClient();

    await client.updateEpic({ epicId: "epic-1", ref: "EPIC-REF-123" });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://pega.example.com/prweb/PRRestService/api/v1/cases/EPIC-REF-123");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ content: { SourceEpicId: "epic-1" } });
    expect(Object.keys(body.content)).not.toEqual(expect.arrayContaining(["Sprint", "Status", "StoryPoints"]));
  });

  it("throws a clear error when the API call fails", async () => {
    stubTokenThen(jsonResponse({ errorDetails: "case type not found" }, 404));
    const client = new RealAgileStudioClient();

    await expect(client.publishEpic({ epicId: "epic-1", title: "X" })).rejects.toThrow(
      "Agile Studio API request failed (404 /api/v1/cases)"
    );
  });
});
