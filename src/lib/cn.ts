/** Minimal className joiner — no dedup logic needed since this codebase never passes conflicting Tailwind utilities for the same property through this helper. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
