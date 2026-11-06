# E2E tests

Real browser tests (Playwright) against the real Supabase project, driving
actual sign-up/sign-in/password-reset/magic-link flows, the core project/
charter CRUD path, and the merge/split, delivery-partner, minutes-ack, and
SLA-sweep features built on top of it. Every test creates its own throwaway
user (and project, where relevant) and deletes it in a `finally`/cleanup
step — none of them touch the shared dev account or real project data.

`accessibility.spec.ts` is a bit different: it drives the same real
Chromium through every major page (seeded with representative data) and
runs `axe-core` (via `@axe-core/playwright`) against each one for WCAG 2.1
A/AA violations — automated coverage, not a substitute for a manual
screen-reader walkthrough. See BACKLOG.md EPIC 16 for what that does and
doesn't cover.

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
