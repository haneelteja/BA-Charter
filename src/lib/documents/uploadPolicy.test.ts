import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sanitizeFileName, validateUpload, withTimeout } from "./uploadPolicy";

describe("sanitizeFileName", () => {
  it.each([
    ["report.pdf", "report.pdf"],
    ["../../other-project/x.pdf", "x.pdf"],
    ["..\\..\\x.docx", "x.docx"],
    [".env", "env"],
    ["a\u0000b.txt", "ab.txt"],
    ["résumé <final>.md", "r_sum_ _final_.md"],
    ["", "document"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it("bounds the length", () => {
    expect(sanitizeFileName(`${"a".repeat(500)}.pdf`).length).toBeLessThanOrEqual(124);
  });
});

describe("validateUpload", () => {
  const blob = (bytes: number[] | string) => new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)]);

  it("accepts a real PDF header", async () => {
    expect(await validateUpload(blob([0x25, 0x50, 0x44, 0x46, 0x2d]), "a.pdf")).toBeNull();
  });
  it("rejects a renamed file posing as a PDF", async () => {
    expect(await validateUpload(blob("MZ\u0090\u0000"), "a.pdf")).toMatch(/not a valid PDF/);
  });
  it("rejects a docx without a zip header", async () => {
    expect(await validateUpload(blob("hello"), "a.docx")).toMatch(/not a valid Word/);
  });
  it("rejects unsupported extensions", async () => {
    expect(await validateUpload(blob("x"), "a.exe")).toMatch(/Unsupported/);
  });
  it("rejects binary content in a .txt", async () => {
    expect(await validateUpload(blob([0x41, 0x00, 0x42]), "a.txt")).toMatch(/plain text/);
  });
  it("rejects oversized files", async () => {
    const big = { size: MAX_UPLOAD_BYTES + 1, slice: () => blob("x") } as unknown as Blob;
    expect(await validateUpload(big, "a.txt")).toMatch(/at most/);
  });
});

describe("withTimeout", () => {
  it("rejects slow work", async () => {
    await expect(withTimeout(new Promise(() => {}), 10, "too slow")).rejects.toThrow("too slow");
  });
  it("returns fast work", async () => {
    expect(await withTimeout(Promise.resolve(1), 100, "x")).toBe(1);
  });
});
