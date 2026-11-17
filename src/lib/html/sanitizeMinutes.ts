import sanitizeHtml from "sanitize-html";

/**
 * Minutes HTML comes from two untrusted places — LLM output (which can be
 * steered by transcript content) and a free-form textarea any project
 * member can edit — and is rendered with dangerouslySetInnerHTML in the app,
 * on the public /minutes/[token] page, and in outbound email. Every one of
 * those paths must go through this allowlist: structural/text tags only,
 * https/mailto links only, no attributes beyond href, no inline styles,
 * scripts, event handlers, iframes, forms or images.
 *
 * Applied both on write (so stored HTML is clean) and on render (so rows
 * written before this existed, or by any other path, are still safe).
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "hr",
    "ul", "ol", "li",
    "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "a",
  ],
  // rel/target are added by the transform below, so they must be allowed too.
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

export function sanitizeMinutesHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}
