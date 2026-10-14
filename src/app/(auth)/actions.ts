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

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message);
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
    throw new Error(error.message);
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
    // Supabase's default built-in email sender is rate-limited to a
    // handful of sends per hour — it's a sandbox for local dev, not meant
    // for production traffic. A custom SMTP provider (e.g. Resend, already
    // configured for the app's other outbound email) needs to be set in
    // Supabase Dashboard → Authentication → Emails → SMTP Settings to lift
    // this. Use the password form below in the meantime.
    if (error.code === "over_email_send_rate_limit") {
      throw new Error(
        "Magic link emails are rate-limited on this project's default email sender right now. Use the password form below instead, or try again shortly."
      );
    }
    throw new Error(error.message);
  }

  redirect("/sign-in?check-email=1");
}

export async function signOut() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
