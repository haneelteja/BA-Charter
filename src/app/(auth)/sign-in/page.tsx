import {
  signInWithPassword,
  signInWithMagicLink,
  signUpWithPassword,
} from "../actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ "check-email"?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">BA Charter</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to continue.</p>
      </div>

      {params["check-email"] && (
        <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Check your email to finish signing in.
        </div>
      )}

      <form action={signInWithMagicLink} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Magic link</h2>
        <input
          name="email"
          type="email"
          placeholder="you@company.com"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Send magic link
        </button>
      </form>

      <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

      <form action={signInWithPassword} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Password</h2>
        <input
          name="email"
          type="email"
          placeholder="you@company.com"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Sign in
        </button>
      </form>

      <details className="text-sm text-neutral-500">
        <summary className="cursor-pointer">New here? Create an account</summary>
        <form action={signUpWithPassword} className="mt-3 flex flex-col gap-3">
          <input
            name="full_name"
            placeholder="Full name"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="email"
            type="email"
            placeholder="you@company.com"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Create account
          </button>
        </form>
      </details>
    </main>
  );
}
