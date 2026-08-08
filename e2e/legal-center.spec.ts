import { expect, test, type Page } from "@playwright/test";

const DOCUMENTS = [
  ["informacion-empresarial", "Información empresarial"],
  ["politica-de-privacidad", "Política de privacidad"],
  ["tratamiento-de-datos", "Política de tratamiento de datos personales"],
  ["aviso-de-privacidad", "Aviso de privacidad"],
  ["autorizacion-general-de-tratamiento", "Autorización general de tratamiento"],
  ["consentimiento-whatsapp", "Consentimiento para WhatsApp"],
  ["consentimiento-correo-electronico", "Consentimiento para correo electrónico"],
  ["consentimiento-comunicaciones-comerciales", "Consentimiento de comunicaciones comerciales"],
  ["tratamiento-datos-sensibles", "Tratamiento de datos sensibles"],
  ["tratamiento-menores-y-beneficiarios", "Tratamiento de menores y beneficiarios"],
  ["terminos-y-condiciones", "Términos y condiciones de uso"],
  ["condiciones-portal-empresarial", "Condiciones del portal empresarial"],
  ["condiciones-portal-afiliado", "Condiciones del portal de usuario o afiliado"],
  ["terminos-de-pago", "Términos de pago"],
  ["reversiones-y-reembolsos", "Reversiones, devoluciones y reembolsos"],
  ["pqr", "Política y procedimiento de PQR"],
  ["procedimiento-consultas-y-reclamos", "Consultas y reclamos de titulares"],
  ["politica-de-cookies", "Política de cookies"],
  ["seguridad", "Política de seguridad de la información"],
  ["accesibilidad", "Declaración de accesibilidad"],
  ["politica-comunicaciones-electronicas", "Política de comunicaciones electrónicas"],
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
}

test.describe("Centro Legal publicado", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`Centro Legal visible y sin overflow en ${viewport.name}`, async ({ page }) => {
      const legalResponses: Array<{ url: string; status: number }> = [];
      const failedRequests: string[] = [];
      page.on("response", (response) => {
        if (response.url().includes("/api/v1/legal-documents/") && response.request().method() === "GET") legalResponses.push({ url: response.url(), status: response.status() });
      });
      page.on("requestfailed", (request) => {
        if (request.url().includes("/api/v1/legal-documents/")) failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`);
      });
      await page.setViewportSize(viewport);
      await page.goto("/legal");
      await expect(page.getByRole("heading", { level: 1, name: "Centro Legal ASODEF" })).toBeVisible();
      await expect(page.getByText("21 documentos organizados por tema", { exact: false })).toBeVisible();
      await expect.poll(() => legalResponses.length + failedRequests.length).toBe(21);
      expect(failedRequests).toEqual([]);
      expect(legalResponses.map((response) => response.status)).toEqual(Array(21).fill(200));
      await expect(page.locator("main").getByText("Vigente", { exact: true })).toHaveCount(21);
      await expect(page.locator("main").getByText("No disponible")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(/Versión\s+\d+/i);
      await expect(page.locator("body")).not.toContainText(/Pendiente de confirmación legal|LEGAL_CONTENT_PLACEHOLDER|Aún no publicado/i);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("las 21 páginas vigentes son legibles en Chromium", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [slug, title] of DOCUMENTS) {
      await page.goto(`/legal/${slug}`);
      if (slug === "pqr") {
        await expect(page.getByRole("heading", { level: 1, name: "PQR" })).toBeVisible();
        await page.getByText("Consultar la política PQR vigente").click();
        await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
        await expect(page.getByText("Vigente", { exact: true })).toBeVisible();
        await expect(page.locator("article h2").first()).toBeVisible();
      }
      await expect(page.locator("main")).not.toContainText(/Pendiente de confirmación legal|LEGAL_CONTENT_PLACEHOLDER|Aún no publicado/i);
      await expect(page.locator("main")).not.toContainText(/Versión\s+\d+/i);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("los fixtures sintéticos no aparecen en descubrimiento público", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.locator('a[href*="consent-test-doc-"]')).toHaveCount(0);
  });
});
