import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updatePassword } from "../actions";
import { Button, Card, PasswordInput, PasswordStrengthField } from "@/components/ui";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  // Only reachable with the session verifyOtp(type=recovery) establishes
  // in /auth/confirm — no session means the link was never clicked, is
  // stale, or was already used once.
  if (!auth.user) {
    redirect(
      `/sign-in?error=${encodeURIComponent("This reset link is invalid or has expired. Request a new one.")}`
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-background to-background p-6 dark:from-indigo-950/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
            BA
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">for {auth.user.email}</p>
        </div>

        {params.error && (
          <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {params.error}
          </div>
        )}

        <Card className="p-6">
          <form action={updatePassword} className="flex flex-col gap-3">
            <PasswordStrengthField id="reset-password" name="password" placeholder="New password" />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-confirm-password" className="text-xs font-medium text-muted">
                Confirm new password
              </label>
              <PasswordInput id="reset-confirm-password" name="confirm_password" placeholder="Confirm new password" required />
            </div>
            <Button type="submit" variant="primary">
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
