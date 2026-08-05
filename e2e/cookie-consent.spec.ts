import { test, expect } from "@playwright/test";

/**
 * US-066: e2e coverage for the cookie banner (US-047's own Vitest/RTL
 * suite already covers the unit-level "no optional category preselected"
 * AC - this file covers the literal e2e ACs: first-visit visibility, and
 * that rejecting optional cookies both persists across a reload and
 * never triggers a marketing script tag).
 */
test.describe("Cookie consent banner (e2e)", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("visiting the site for the first time shows the cookie banner", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Usamos cookies estrictamente necesarias")).toBeVisible();
  });

  test("Example (AC): rejecting optional cookies persists on reload and never loads a marketing script tag", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Rechazar opcionales" }).click();
    await expect(page.getByText("Usamos cookies estrictamente necesarias")).not.toBeVisible();

    await page.reload();
    await expect(page.getByText("Usamos cookies estrictamente necesarias")).not.toBeVisible();

    // No analytics/marketing vendor is confirmed anywhere in this project
    // (script-gate.ts's own doc comment) - so no script tag should exist
    // whether consent was granted or not. This is the literal, honest
    // shape of the AC given nothing invokes loadScriptIfConsented() with
    // a real vendor script yet.
    const scriptSrcs = await page.locator("script[src]").evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).src));
    for (const src of scriptSrcs) {
      expect(src).not.toMatch(/analytics|gtag|googletagmanager|facebook\.net|doubleclick/i);
    }
  });
});
