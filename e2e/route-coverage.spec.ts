import { expect, test, type Page } from "@playwright/test";
import { disconnectTestActorsClient, ensureTestActor, TEST_ACTOR_PASSWORD } from "./support/test-actors";

const ADMIN_EMAIL = "e2e.super-admin.routes@example.com";
const COMPANY_EMAIL = "e2e.company.routes@example.com";

async function login(page: Page, email: string) {
  await page.goto("/iniciar-sesion");
  await page.getByLabel("Correo electrónico", { exact: false }).fill(email);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(TEST_ACTOR_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/iniciar-sesion/);
}

test.describe("cobertura de rutas solicitadas", () => {
  test.beforeAll(async () => {
    await ensureTestActor(ADMIN_EMAIL, "E2E Route Super Admin", "SUPER_ADMIN");
    await ensureTestActor(COMPANY_EMAIL, "E2E Route Company", "COMPANY_PARTNER");
  });

  test.afterAll(async () => disconnectTestActorsClient());

  test("rutas públicas principales", async ({ page }) => {
    for (const route of ["/", "/legal", "/login", "/pagos"]) {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Página no encontrada|Service Unavailable/i);
    }
    await expect(page).toHaveURL(/\/pagos$/);
  });

  test("portal de cuenta y portal empresarial respetan autenticación y rol", async ({ page }) => {
    await login(page, COMPANY_EMAIL);
    await page.goto("/mi-cuenta");
    await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();
    await page.goto("/empresa");
    await expect(page.getByRole("heading", { name: "Panel de empresa" })).toBeVisible();
    await expect(page.getByText("No tienes permisos para ver esta página")).toHaveCount(0);
  });

  test("SUPER_ADMIN accede a cada área administrativa requerida", async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    const routes = [
      "/admin", "/admin/legal", "/admin/crm", "/admin/crm/empresas", "/admin/pqr",
      "/admin/solicitudes-de-datos", "/admin/pagos", "/admin/reportes", "/admin/contratos", "/admin/comunicaciones",
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main#main-content")).toBeVisible();
      await expect(page.getByText("No tienes permisos para ver esta página")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/Página no encontrada|Service Unavailable/i);
    }
  });
});
