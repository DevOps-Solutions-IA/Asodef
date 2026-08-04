import { test, expect } from "@playwright/test";

/**
 * US-035: golden-path browser smoke test. Uses the seeded demo
 * customer (Cliente Demo Uno, document 1000000001) - the same fixture
 * every prior story's own runtime verification has used all session -
 * never a fabricated document number.
 */
const SEEDED_DEMO_DOCUMENT_NUMBER = "1000000001";
const UNKNOWN_DOCUMENT_NUMBER = "9999999999";

test.describe("ASODEF golden-path smoke test", () => {
  test("homepage loads with the hero visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("completing a payment lookup for the seeded demo customer reaches the order summary screen", async ({ page }) => {
    await page.goto("/pagos");
    await page.getByLabel("Número de documento", { exact: false }).fill(SEEDED_DEMO_DOCUMENT_NUMBER);
    await page.getByRole("button", { name: "Buscar" }).click();

    await expect(page.getByText("Cliente Demo Uno", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pagar" }).first().click();

    await expect(page.getByRole("heading", { name: "Resumen de tu pago" })).toBeVisible();
    await expect(page).toHaveURL(/\/pagos\/orden\//);
  });

  test("Negative case: a deliberately broken lookup (wrong document number) shows the not-found state, never an order screen", async ({
    page,
  }) => {
    await page.goto("/pagos");
    await page.getByLabel("Número de documento", { exact: false }).fill(UNKNOWN_DOCUMENT_NUMBER);
    await page.getByRole("button", { name: "Buscar" }).click();

    await expect(page.getByText("No se encontraron resultados")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resumen de tu pago" })).not.toBeVisible();
    await expect(page).toHaveURL(/\/pagos$/);
  });

  test("/iniciar-sesion rejects invalid credentials with a visible error message", async ({ page }) => {
    await page.goto("/iniciar-sesion");
    await page.getByLabel("Correo electrónico", { exact: false }).fill("no-existe@example.com");
    // getByLabel("Contraseña") also matches the show/hide toggle button
    // (its own aria-label, "Mostrar contraseña", contains the same
    // substring) - scope to the textbox role to disambiguate.
    await page.getByRole("textbox", { name: "Contraseña" }).fill("wrong-password");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    // The generic anti-enumeration message (US-006/US-010), never a raw
    // backend error or stack trace.
    await expect(page.getByRole("alert")).toHaveText(/credenciales inválidas/i);
  });
});
