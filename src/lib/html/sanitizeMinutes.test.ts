import { describe, expect, it } from "vitest";
import { sanitizeMinutesHtml } from "./sanitizeMinutes";

describe("sanitizeMinutesHtml", () => {
  it("keeps the structural tags minutes are written in", () => {
    const html = "<h2>Decisions</h2><ul><li><strong>Go</strong> live in March</li></ul><p>Thanks</p>";
    expect(sanitizeMinutesHtml(html)).toBe(html);
  });

  it("removes script tags and their content", () => {
    expect(sanitizeMinutesHtml('<p>a</p><script>alert(1)</script>')).toBe("<p>a</p>");
  });

  it("removes event handler attributes", () => {
    expect(sanitizeMinutesHtml('<p onclick="steal()">x</p><img src=x onerror=alert(1)>')).toBe("<p>x</p>");
  });

  it("drops javascript: and data: links but keeps https", () => {
    const out = sanitizeMinutesHtml(
      '<a href="javascript:alert(1)">a</a><a href="data:text/html,x">b</a><a href="https://example.com">c</a>'
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("strips iframes, forms, styles and svg", () => {
    const out = sanitizeMinutesHtml(
      '<iframe src="https://evil"></iframe><form action="https://evil"><input name=p></form><style>*{}</style><svg onload=alert(1)></svg><p style="x">ok</p>'
    );
    expect(out).toBe("<p>ok</p>");
  });

  it("returns an empty string for null", () => {
    expect(sanitizeMinutesHtml(null)).toBe("");
  });
});
