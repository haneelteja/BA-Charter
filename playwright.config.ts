import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // tests share one real Supabase project — avoid cross-test interference
  workers: 1, // several tests send real email (signup/magic-link/reset) — Supabase/Resend rate-limit concurrent sends from parallel workers
  timeout: 60_000, // generous enough for Turbopack's cold-compile-on-first-visit, hit repeatedly during this project's development
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
