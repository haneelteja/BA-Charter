import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "evil.example", origin: "https://evil.example" }),
}));

import { getAppBaseUrl, normalizeBaseUrl } from "./appUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppBaseUrl", () => {
  it("uses APP_BASE_URL and ignores request headers", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.com/some/path");
    expect(await getAppBaseUrl()).toBe("https://app.example.com");
  });

  it("refuses to fall back to request headers in production", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(getAppBaseUrl()).rejects.toThrow("APP_BASE_URL is not set");
  });

  it("falls back to the Host header only in development", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(await getAppBaseUrl()).toBe("http://evil.example");
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizeBaseUrl("javascript:alert(1)")).toThrow();
  });
});
