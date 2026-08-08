import { expect, test, type Page } from "@playwright/test";
import { disconnectTestActorsClient, ensureTestActor, TEST_ACTOR_PASSWORD } from "./support/test-actors";

const ADMIN_EMAIL = "e2e.super-admin.routes@example.com";

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

  test("los portales usan sesiones de autoservicio independientes", async ({ page }) => {
    await page.goto("/mi-cuenta");
    await expect(page).toHaveURL(/\/mi-cuenta\/acceso$/);
    await expect(page.getByRole("heading", { name: "Acceso de afiliados" })).toBeVisible();
    await expect(page.getByLabel("Número de documento del titular")).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toHaveCount(0);
    await page.goto("/empresa");
    await expect(page).toHaveURL(/\/empresa\/acceso$/);
    await expect(page.getByRole("heading", { name: "Acceso de empresas" })).toBeVisible();
    await expect(page.getByLabel("NIT de la empresa")).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toHaveCount(0);
  });

  test("el proveedor no configurado falla de forma controlada y nunca simula una sesión", async ({ page }) => {
    await page.goto("/mi-cuenta/acceso");
    await page.getByLabel("Número de documento del titular").fill("10203040");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("El servicio de verificación no está disponible en este momento. Intenta nuevamente más tarde.")).toBeVisible();
    await expect(page).toHaveURL(/\/mi-cuenta\/acceso$/);

    await page.goto("/empresa/acceso");
    await page.getByLabel("NIT de la empresa").fill("900123456-7");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("El servicio de verificación no está disponible en este momento. Intenta nuevamente más tarde.")).toBeVisible();
    await expect(page).toHaveURL(/\/empresa\/acceso$/);
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
