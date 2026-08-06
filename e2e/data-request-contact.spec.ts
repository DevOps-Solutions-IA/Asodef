import { expect, test } from "@playwright/test";

test.describe("public data-rights and contact routing", () => {
  test("the progressive data-rights flow submits and tracks without exposing identity", async ({ page }) => {
    await page.goto("/solicitudes-de-datos?accion=crear");
    await page.getByRole("radio", { name: /Acceso a mis datos/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Descripción de la solicitud", { exact: false }).fill("Solicitud de acceso de prueba end-to-end.");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByLabel("Nombre completo", { exact: false }).fill("Titular E2E");
    await page.getByLabel("Número de documento", { exact: false }).fill("900000001");
    await page.getByLabel("Correo electrónico", { exact: false }).fill("titular.e2e@example.com");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("checkbox", { name: /Acepto el tratamiento de mis datos/ }).check();
    await page.getByRole("button", { name: "Confirmar y enviar" }).click();

    await expect(page.getByRole("heading", { name: "Solicitud registrada" })).toBeVisible();
    const copyLabel = await page.getByRole("button", { name: /^Copiar referencia:/ }).getAttribute("aria-label");
    const reference = copyLabel?.replace(/^Copiar referencia:\s*/, "").trim();
    expect(reference?.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Consultar estado" }).click();
    await expect(page.getByText("Acceso a mis datos", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: /Estado actual:/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/Titular E2E|900000001|titular\.e2e@example\.com/);
  });

  test("contact sends specialized needs directly and reveals the minimal general form on demand", async ({ page }) => {
    await page.goto("/contacto");
    await expect(page.getByRole("link", { name: /Consultar un pago/ })).toHaveAttribute("href", "/pagos");
    await expect(page.getByRole("link", { name: /Radicar una PQR/ })).toHaveAttribute("href", "/pqr?accion=radicar");
    await expect(page.getByRole("link", { name: /Ejercer un derecho/ })).toHaveAttribute("href", "/solicitudes-de-datos?accion=crear");
    await expect(page.getByRole("button", { name: "Enviar mensaje" })).toHaveCount(0);
    await page.getByRole("button", { name: /Otro asunto/ }).click();
    await expect(page.getByRole("heading", { name: "Registra un mensaje para orientación" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar mensaje" })).toBeVisible();
  });
});
