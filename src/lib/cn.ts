import { twMerge } from "tailwind-merge";

/**
 * className joiner with Tailwind-aware conflict resolution — later classes
 * win over earlier ones for the same CSS property (e.g. a caller overriding
 * `Card`'s default `bg-surface` with `bg-indigo-600` must not have both
 * classes reach the DOM, since the one Tailwind happens to generate later
 * in the stylesheet would silently win regardless of call-site order).
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
