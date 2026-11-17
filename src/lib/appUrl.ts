import { headers } from "next/headers";

/**
 * Base URL for links the app emails out (auth redirects, minutes
 * acknowledgement links).
 *
 * Request headers (Origin, Host, X-Forwarded-*) are attacker-controllable:
 * building emailed links from them lets anyone who can trigger an email
 * point its link at their own host. Production must set APP_BASE_URL; the
 * header fallback exists only for local development.
 */
export function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("APP_BASE_URL must be an http(s) URL.");
  }
  return url.origin;
}

export async function getAppBaseUrl(): Promise<string> {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    return normalizeBaseUrl(configured);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is not set. Set it to the app's public URL, for example https://ba-charter.example.com.");
  }
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  return `http://${host}`;
}
