import { describe, expect, it } from "vitest";
import { generateAckToken, hashAckToken, isWithinAckWindow } from "./ackToken";

describe("ack tokens", () => {
  it("generates 256-bit base64url tokens", () => {
    const token = generateAckToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateAckToken()).not.toBe(token);
  });

  it("hashes to the same hex as the SQL backfill (sha256 of UTF-8)", () => {
    // echo -n "abc" | sha256sum
    expect(hashAckToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("isWithinAckWindow", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("is open before the window ends", () => {
    expect(isWithinAckWindow("2026-11-17T13:00:00Z", now)).toBe(true);
  });
  it("is closed after the window ends", () => {
    expect(isWithinAckWindow("2026-11-17T11:00:00Z", now)).toBe(false);
  });
  it("is open when no window was recorded (minutes distributed before 0026)", () => {
    expect(isWithinAckWindow(null, now)).toBe(true);
  });
});
