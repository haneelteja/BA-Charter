# E2E tests

Real browser tests (Playwright) against the real Supabase project, driving
actual sign-up/sign-in/password-reset/magic-link flows and one project/
charter CRUD path. Every test creates its own throwaway user (and project,
where relevant) and deletes it in a `finally`/cleanup step — none of them
touch the shared dev account or real project data.

## Why these aren't in the required CI gate

This project has exactly one Supabase project — no separate CI/staging
instance. Running these on every push/PR would mean every CI run creates
and deletes real rows against production, requires the service-role key as
a GitHub Actions secret, and turns a routine push into something that can
fail for reasons having nothing to do with the diff (email-provider rate
limits, transient network issues, a slow cold start). `npm run test` (unit
tests, `src/**/*.test.ts`) *is* in CI — pure logic, zero external
dependencies, safe to run on every push.

Run this suite manually instead, whenever auth or the core CRUD path
changes:

```bash
npx playwright install chromium   # once
npm run dev                       # in one terminal
npm run test:e2e                  # in another
```

Needs `.env.local` filled in (same file the app itself uses) — tests read
`SUPABASE_SERVICE_ROLE_KEY` directly to generate real auth links and clean
up afterward.
