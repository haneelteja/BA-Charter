import { requireEnv } from "@/lib/env";

/**
 * RFC 6749 §4.4 client-credentials grant with HTTP Basic client
 * authentication (§2.3.1) — the pattern Pega Platform's own OAuth2 client
 * registrations use for machine-to-machine REST calls. Unlike the actual
 * case-management endpoints in restClient.ts (which are necessarily a
 * guess — see that file's header comment), this part is standard and not
 * org-specific: any correctly configured Pega OAuth2 client with the
 * Client Credentials grant enabled speaks this exact protocol.
 */

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

/** Test-only: forces the next getAccessToken() call to re-fetch instead of reusing a cached token. */
export function clearAgileStudioTokenCache(): void {
  cache = null;
}

export async function getAgileStudioAccessToken(): Promise<string> {
  // 5s safety margin so a token doesn't expire mid-request.
  if (cache && cache.expiresAt > Date.now() + 5000) {
    return cache.accessToken;
  }

  const tokenUrl = requireEnv("AGILE_STUDIO_TOKEN_URL");
  const clientId = requireEnv("AGILE_STUDIO_CLIENT_ID");
  const clientSecret = requireEnv("AGILE_STUDIO_CLIENT_SECRET");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Agile Studio OAuth token request failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number };
  cache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cache.accessToken;
}
