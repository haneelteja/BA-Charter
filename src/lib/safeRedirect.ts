/**
 * Returns `next` only if it is a same-origin relative path, else "/".
 *
 * Used wherever a redirect target comes from the URL (e.g. /auth/confirm's
 * ?next=). Without this, `next=https://evil.example` is an open redirect,
 * and `next=javascript:...` executes script on this origin when assigned
 * to window.location.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  // Must be a rooted path, not protocol-relative ("//host") or a
  // backslash variant browsers normalise to it ("/\host"), and contain no
  // control characters (which some browsers strip before parsing).
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
