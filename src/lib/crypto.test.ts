import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

// getKey() (crypto.ts) reads CREDENTIAL_ENCRYPTION_KEY via requireEnv() fresh
// on every call, not at import time — safe to set per-test rather than
// relying on .env.local, keeping this suite self-contained.
beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const plaintext = "sk-test-some-api-key-12345";
    const stored = encryptSecret(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-plaintext");
    const b = encryptSecret("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("stores as iv:authTag:ciphertext, all base64", () => {
    const stored = encryptSecret("x");
    const parts = stored.split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    }
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptSecret("not-enough-parts")).toThrow("Malformed encrypted secret.");
  });

  it("rejects a tampered ciphertext (GCM auth tag check)", () => {
    const stored = encryptSecret("sensitive value");
    const [iv, authTag, ciphertext] = stored.split(":");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tampered = [iv, authTag, tamperedCiphertext.toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a key that isn't 32 bytes", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x")).toThrow("must decode to exactly 32 bytes");
  });
});
