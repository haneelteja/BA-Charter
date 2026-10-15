"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function getEmailRedirectTo() {
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host")}`;
  return `${origin}/auth/confirm`;
}

/**
 * Next.js redacts thrown Server Action error messages in production builds
 * — the client only ever sees "Minified React error #441", regardless of
 * any error.tsx boundary, since the real message never crosses the wire.
 * Returning via redirect()+searchParams sidesteps that entirely (and
 * matches the existing ?check-email=1 success-state pattern below) instead
 * of throwing.
 */
function errorRedirect(message: string): never {
  redirect(`/sign-in?error=${encodeURIComponent(message)}`);
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorRedirect(error.message);
  }

  redirect("/");
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || email },
      emailRedirectTo: await getEmailRedirectTo(),
    },
  });

  if (error) {
    errorRedirect(error.message);
  }

  redirect("/sign-in?check-email=1");
}

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: await getEmailRedirectTo(),
    },
  });

  if (error) {
    // over_email_send_rate_limit covers two distinct Supabase settings —
    // the per-project send rate and the per-user minimum interval (60s,
    // configured in Dashboard → Authentication → Emails → SMTP Settings) —
    // and Supabase's own message already says exactly which one and how
    // long to wait, so it's passed through as-is rather than guessing.
    errorRedirect(error.message);
  }

  redirect("/sign-in?check-email=1");
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
