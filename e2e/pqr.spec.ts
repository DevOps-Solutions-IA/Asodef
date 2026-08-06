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
  test("the canonical progressive flow submits and immediately tracks a real case", async ({ page }) => {
    await page.goto("/pqr?accion=radicar");
    try {
      await page.getByRole("button", { name: "Rechazar opcionales" }).click({ timeout: 3000 });
    } catch {
      // Consent already decided in this browser context - fine either way.
    }

    await page.getByRole("radio", { name: /Reclamo/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Descripción del caso", { exact: false }).fill("Caso de prueba end-to-end generado por Playwright.");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Nombre completo", { exact: false }).fill("Visitante E2E");
    await page.getByLabel("Correo o teléfono de contacto", { exact: false }).fill("visitante.e2e@example.com");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("checkbox", { name: /Acepto el tratamiento necesario/ }).check();
    await page.getByRole("button", { name: "Confirmar y enviar" }).click();

    await expect(page.getByRole("heading", { name: "PQR registrada" })).toBeVisible();
    const copyLabel = await page.getByRole("button", { name: /^Copiar referencia:/ }).getAttribute("aria-label");
    const trackingNumber = copyLabel?.replace(/^Copiar referencia:\s*/, "").trim();
    expect(trackingNumber?.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByText("Reclamo", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: /Estado actual:/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Visitante E2E");
  });
});
