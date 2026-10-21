import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ "check-email"?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-background to-background p-6 dark:from-indigo-950/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
            BA
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">We&apos;ll email you a link to set a new one.</p>
        </div>

        {params["check-email"] && (
          <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </div>
        )}

        {params.error && (
          <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {params.error}
          </div>
        )}

        <Card className="p-6">
          <form action={requestPasswordReset} className="flex flex-col gap-3">
            <Field label="Email" htmlFor="forgot-email">
              <Input id="forgot-email" name="email" type="email" placeholder="you@company.com" required />
            </Field>
            <Button type="submit" variant="primary">
              Send reset link
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/sign-in" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
