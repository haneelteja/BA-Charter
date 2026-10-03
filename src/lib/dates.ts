/** Not called directly from component render bodies — see clarifications/page.tsx. */
export function isOlderThanDays(isoTimestamp: string, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(isoTimestamp).getTime() < cutoff;
}
