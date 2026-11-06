import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAgileStudioTokenCache, getAgileStudioAccessToken } from "./oauth";

function mockTokenResponse(body: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

beforeEach(() => {
  clearAgileStudioTokenCache();
  process.env.AGILE_STUDIO_TOKEN_URL = "https://pega.example.com/prweb/PRRestService/oauth2/v1/token";
  process.env.AGILE_STUDIO_CLIENT_ID = "test-client-id";
  process.env.AGILE_STUDIO_CLIENT_SECRET = "test-client-secret";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getAgileStudioAccessToken", () => {
  it("requests a token with the client-credentials grant and HTTP Basic auth", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ access_token: "tok-1", expires_in: 3600 }));

    const token = await getAgileStudioAccessToken();

    expect(token).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://pega.example.com/prweb/PRRestService/oauth2/v1/token");
    expect(init?.method).toBe("POST");
    const expectedBasic = Buffer.from("test-client-id:test-client-secret").toString("base64");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${expectedBasic}`);
    expect((init?.body as URLSearchParams).toString()).toBe("grant_type=client_credentials");
  });

  it("caches the token and does not re-fetch while still valid", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ access_token: "tok-1", expires_in: 3600 }));

    const first = await getAgileStudioAccessToken();
    const second = await getAgileStudioAccessToken();

    expect(first).toBe("tok-1");
    expect(second).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cached token has expired", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ access_token: "tok-1", expires_in: 60 }));

    const first = await getAgileStudioAccessToken();
    expect(first).toBe("tok-1");

    vi.advanceTimersByTime(61_000);
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ access_token: "tok-2", expires_in: 3600 }));

    const second = await getAgileStudioAccessToken();
    expect(second).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws a clear error when the token endpoint rejects the request", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ error: "invalid_client" }, 401));

    await expect(getAgileStudioAccessToken()).rejects.toThrow("Agile Studio OAuth token request failed (401)");
  });

  it("clearAgileStudioTokenCache forces the next call to re-fetch", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ access_token: "tok-1", expires_in: 3600 }));
    await getAgileStudioAccessToken();

    clearAgileStudioTokenCache();
    fetchMock.mockResolvedValueOnce(mockTokenResponse({ access_token: "tok-2", expires_in: 3600 }));
    const token = await getAgileStudioAccessToken();

    expect(token).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
