import { describe, expect, it, vi } from "vitest";
import { isOlderThanDays } from "./dates";

describe("isOlderThanDays", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("returns true for a timestamp older than the threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(isOlderThanDays("2026-06-01T00:00:00.000Z", 10)).toBe(true);
    vi.useRealTimers();
  });

  it("returns false for a timestamp within the threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(isOlderThanDays("2026-06-14T00:00:00.000Z", 10)).toBe(false);
    vi.useRealTimers();
  });

  it("treats the exact boundary as not yet older (strict less-than)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const exactlyAtCutoff = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isOlderThanDays(exactlyAtCutoff, 10)).toBe(false);
    vi.useRealTimers();
  });
});
