"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

/**
 * Route-segment error boundary for (auth). Every sign-in/sign-up form posts
 * directly to a Server Action with no client-side try/catch (plain <form
 * action={...}>, matching every other form in the app) — without this file,
 * any thrown error (wrong password, Supabase rate limits, etc.) crashed to a
 * blank error page instead of showing the user what happened.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">{error.message || "Please try again."}</p>
        <Button variant="primary" className="mt-4 w-full" onClick={reset}>
          Try again
        </Button>
      </Card>
    </main>
  );
}
