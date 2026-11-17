import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === "development";

/**
 * The browser talks to Supabase directly (auth on /auth/confirm), so its
 * origin is the one cross-origin connection the CSP allows. Read at build
 * time, so NEXT_PUBLIC_SUPABASE_URL must be set when building.
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (raw) {
      const url = new URL(raw);
      return [url.origin, `wss://${url.host}`];
    }
  } catch {
    // fall through
  }
  // Headers are fixed at build time; if the build ran without the variable,
  // allow hosted Supabase rather than break sign-in.
  return ["https://*.supabase.co", "wss://*.supabase.co"];
}

// Without nonces, per node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
// 'unsafe-inline' for scripts is what Next needs without nonces; the policy
// still blocks third-party script hosts, plugins, framing, <base> hijacking
// and form posts to other sites. Inline minutes HTML is sanitised separately
// (src/lib/html/sanitizeMinutes.ts).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins().join(" ")}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Public acknowledgement links carry their token in the path: never
        // send it to another site in a Referer header, and never cache it.
        source: "/minutes/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
