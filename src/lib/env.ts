/**
 * Server-only. Uses a dynamic `process.env[name]` lookup, which Next.js's
 * bundler can't statically replace with a build-time value in client
 * code — only literal `process.env.EXACT_NAME` expressions get inlined
 * for the browser. A client component needing a NEXT_PUBLIC_ var must
 * read it as that literal form directly (see src/lib/supabase/client.ts).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}
