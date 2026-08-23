import { defineConfig, devices } from "@playwright/test";

/**
 * US-035: runs against whatever stack is already up (local dev
 * servers today, the docker-compose stack once US-037 stands up web+
 * api as containers) - configurable, never hardcoded, matching this
 * project's own "no hardcoded local fallback ports" convention.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5180";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
