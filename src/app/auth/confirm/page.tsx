"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Bridges every Supabase email-link confirmation (magic link, signup,
 * password recovery) into an authenticated session.
 *
 * This MUST be a client page, not a Route Handler. Supabase's own hosted
 * /auth/v1/verify endpoint — what {{ .ConfirmationURL }} in every email
 * template actually points at — verifies the token itself and redirects
 * back here with the session delivered as a URL *hash fragment*
 * (#access_token=...&refresh_token=...), not a query param. Fragments are
 * never sent in the HTTP request at all, so a server-side route handler
 * can never see them — confirmed by testing the real generated link, not
 * just assuming the token_hash+type query-param shape documented
 * elsewhere in Supabase's docs applied here.
 *
 * Falls back to query-param flows (?code= for PKCE, ?token_hash=&type=
 * for the explicit OTP shape) in case Auth settings ever change which
 * style these links use — harmless to keep, costs nothing if unused.
 */
export default function AuthConfirmPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = getSupabaseBrowserClient();
      const query = new URLSearchParams(window.location.search);
      const next = query.get("next") ?? "/";

      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        window.location.href = next;
        return;
      }

      const code = query.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        window.location.href = next;
        return;
      }

      const tokenHash = query.get("token_hash");
      const type = query.get("type");
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "email" | "recovery" | "invite" | "magiclink" | "signup" | "email_change",
        });
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        window.location.href = next;
        return;
      }

      setError("This link is invalid or has expired.");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (error) {
      window.location.href = `/sign-in?error=${encodeURIComponent(error)}`;
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="text-sm text-muted">Signing you in…</p>
    </main>
  );
}
