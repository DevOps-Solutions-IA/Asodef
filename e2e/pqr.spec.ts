import { test, expect } from "@playwright/test";

/**
 * US-066: e2e coverage for submitting a real PQR case end to end
 * (PqrCasePage.test.tsx already covers this at the Vitest/RTL level with
 * a mocked API - this proves it against the real running backend).
 *
 * US-072: PQR submission also records a data_processing ConsentRecord
 * against the exact current PUBLISHED tratamiento-de-datos version.
 */
test.describe("PQR case submission (e2e)", () => {
  test("submitting a PQR case returns a visible case number", async ({ page }) => {
    await page.goto("/legal/pqr");
    try {
      await page.getByRole("button", { name: "Rechazar opcionales" }).click({ timeout: 3000 });
    } catch {
      // Consent already decided in this browser context - fine either way.
    }

    await page.getByLabel("Categoría", { exact: false }).selectOption({ label: "Reclamo" });
    await page.getByLabel("Nombre completo", { exact: false }).fill("Visitante E2E");
    await page.getByLabel("Correo o teléfono de contacto", { exact: false }).fill("visitante.e2e@example.com");
    await page.getByLabel("Describe tu caso", { exact: false }).fill("Caso de prueba end-to-end generado por Playwright.");
    await page.getByRole("checkbox", { name: /Acepto el tratamiento necesario/ }).check();
    await page.getByRole("button", { name: "Enviar caso" }).click();

    await expect(page.getByText("Tu caso fue registrado. Guarda tu número de caso:")).toBeVisible();
    // The tracking number itself renders inside a <strong> right after
    // that sentence - assert something is actually there, not just the
    // static wrapper text, so a regression that drops the real value
    // (but keeps the label) still fails this test.
    const trackingNumber = await page.locator("strong").last().textContent();
    expect(trackingNumber?.trim().length).toBeGreaterThan(0);
  });
});
