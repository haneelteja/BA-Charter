import {
  signInWithPassword,
  signInWithMagicLink,
  signUpWithPassword,
} from "../actions";
import { Button, Card, Field, Input } from "@/components/ui";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ "check-email"?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-background to-background p-6 dark:from-indigo-950/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm">
            BA
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">BA Charter</h1>
          <p className="mt-1 text-sm text-muted">Sign in to continue.</p>
        </div>

        {params["check-email"] && (
          <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
            Check your email to finish signing in.
          </div>
        )}

        <Card className="flex flex-col gap-6 p-6">
          <form action={signInWithMagicLink} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Magic link</h2>
            <Field label="Email" htmlFor="magic-email">
              <Input id="magic-email" name="email" type="email" placeholder="you@company.com" required />
            </Field>
            <Button type="submit" variant="primary">
              Send magic link
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-surface-border" />
            <span className="text-xs text-muted">or</span>
            <div className="h-px flex-1 bg-surface-border" />
          </div>

          <form action={signInWithPassword} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Password</h2>
            <Field label="Email" htmlFor="password-email">
              <Input id="password-email" name="email" type="email" placeholder="you@company.com" required />
            </Field>
            <Field label="Password" htmlFor="password-password">
              <Input id="password-password" name="password" type="password" placeholder="Password" required />
            </Field>
            <Button type="submit" variant="secondary">
              Sign in
            </Button>
          </form>
        </Card>

        <details className="mt-4 text-sm text-muted">
          <summary className="cursor-pointer text-center transition-colors hover:text-indigo-600 dark:hover:text-indigo-400">
            New here? Create an account
          </summary>
          <Card className="mt-3 flex flex-col gap-3 p-5">
            <form action={signUpWithPassword} className="flex flex-col gap-3">
              <Field label="Full name" htmlFor="signup-name">
                <Input id="signup-name" name="full_name" placeholder="Full name" required />
              </Field>
              <Field label="Email" htmlFor="signup-email">
                <Input id="signup-email" name="email" type="email" placeholder="you@company.com" required />
              </Field>
              <Field label="Password" htmlFor="signup-password" hint="At least 8 characters.">
                <Input id="signup-password" name="password" type="password" placeholder="Password" required minLength={8} />
              </Field>
              <Button type="submit" variant="secondary">
                Create account
              </Button>
            </form>
          </Card>
        </details>
      </div>
    </main>
  );
}
