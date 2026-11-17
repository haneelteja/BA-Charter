import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

describe("safeNextPath", () => {
  it.each([
    ["/reset-password", "/reset-password"],
    ["/projects/abc?tab=1#x", "/projects/abc?tab=1#x"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\tjavascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "reset-password",
  ])("falls back to / for %s", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
