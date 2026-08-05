import { test, expect } from "@playwright/test";
import { TEST_ACTOR_PASSWORD, disconnectTestActorsClient, ensureTestActor } from "./support/test-actors";

const COMMERCIAL_TEST_EMAIL = "e2e.commercial@example.com";

test.describe("Admin company creation (US-074/US-075, e2e)", () => {
  test.afterAll(async () => {
    await disconnectTestActorsClient();
  });

  test("Example (AC): a COMMERCIAL user creates a company through the real form and sees it in the list", async ({ page }) => {
    await ensureTestActor(COMMERCIAL_TEST_EMAIL, "E2E Commercial", "COMMERCIAL");

    await page.goto("/iniciar-sesion");
    await page.getByLabel("Correo electrónico", { exact: false }).fill(COMMERCIAL_TEST_EMAIL);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(TEST_ACTOR_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).not.toHaveURL(/\/iniciar-sesion/);

    await page.goto("/admin/crm/empresas");
    await expect(page.getByRole("heading", { name: "Empresas y aliados" })).toBeVisible();

    await page.getByRole("button", { name: "Nueva empresa" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const uniqueSuffix = Date.now().toString().slice(-8);
    const companyName = `Empresa E2E ${uniqueSuffix}`;
    await dialog.getByLabel("Razón social", { exact: false }).fill(companyName);
    await dialog.getByLabel("NIT", { exact: false }).fill(`900${uniqueSuffix}`);
    await dialog.getByLabel("Nombre de contacto", { exact: false }).fill("Contacto E2E");
    await dialog.getByLabel("Correo de contacto", { exact: false }).fill(`e2e-company-${uniqueSuffix}@example.com`);
    await dialog.getByLabel("Sector", { exact: false }).fill("Servicios");

    await dialog.getByRole("button", { name: "Crear empresa" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(companyName) })).toBeVisible();
  });

  test("Negative case (AC): submitting a duplicate NIT shows the 409 message without losing the form", async ({ page }) => {
    await ensureTestActor(COMMERCIAL_TEST_EMAIL, "E2E Commercial", "COMMERCIAL");

    await page.goto("/iniciar-sesion");
    await page.getByLabel("Correo electrónico", { exact: false }).fill(COMMERCIAL_TEST_EMAIL);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(TEST_ACTOR_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).not.toHaveURL(/\/iniciar-sesion/);

    await page.goto("/admin/crm/empresas");
    const uniqueSuffix = Date.now().toString().slice(-8);
    const nit = `901${uniqueSuffix}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByRole("button", { name: "Nueva empresa" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Razón social", { exact: false }).fill(`Empresa Duplicada ${uniqueSuffix}`);
      await dialog.getByLabel("NIT", { exact: false }).fill(nit);
      await dialog.getByLabel("Nombre de contacto", { exact: false }).fill("Contacto E2E");
      await dialog.getByLabel("Correo de contacto", { exact: false }).fill(`e2e-dup-${attempt}-${uniqueSuffix}@example.com`);
      await dialog.getByLabel("Sector", { exact: false }).fill("Servicios");
      await dialog.getByRole("button", { name: "Crear empresa" }).click();

      if (attempt === 0) {
        await expect(dialog).not.toBeVisible();
      } else {
        await expect(page.getByText(new RegExp(`Ya existe una empresa registrada con el NIT ${nit}`))).toBeVisible();
        await expect(dialog).toBeVisible();
      }
    }
  });
});
