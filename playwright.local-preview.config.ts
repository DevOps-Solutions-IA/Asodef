import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LOCAL_PREVIEW_WEB_URL;
if (!baseURL) {
  throw new Error("LOCAL_PREVIEW_WEB_URL is required for Local Preview review E2E.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "local-preview-manual-review.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
