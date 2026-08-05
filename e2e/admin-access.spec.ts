import { test, expect } from "@playwright/test";
import { CUSTOMER_SERVICE_TEST_EMAIL, CUSTOMER_SERVICE_TEST_PASSWORD, disconnectTestActorsClient, ensureCustomerServiceActor } from "./support/test-actors";

test.describe("Admin platform access control (e2e)", () => {
  test.afterAll(async () => {
    await disconnectTestActorsClient();
  });

  test("an unauthenticated visit to /admin redirects to /iniciar-sesion", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/iniciar-sesion/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("Negative case (AC): a CUSTOMER_SERVICE user navigating directly to /admin/usuarios sees the unauthorized state, not the user list", async ({
    page,
  }) => {
    await ensureCustomerServiceActor();

    await page.goto("/iniciar-sesion");
    await page.getByLabel("Correo electrónico", { exact: false }).fill(CUSTOMER_SERVICE_TEST_EMAIL);
    await page.getByRole("textbox", { name: "Contraseña" }).fill(CUSTOMER_SERVICE_TEST_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).not.toHaveURL(/\/iniciar-sesion/);

    // CUSTOMER_SERVICE holds pqr.manage (reaches /admin/pqr fine) but not
    // users.read - confirm the queue page is reachable first so a
    // failure on /usuarios below is a real permission gate, not a broken
    // login/session.
    await page.goto("/admin/pqr");
    await expect(page.getByRole("heading", { name: "PQR" })).toBeVisible();

    await page.goto("/admin/usuarios");
    await expect(page.getByText("No tienes permisos para ver esta página")).toBeVisible();
    await expect(page.getByRole("table")).not.toBeVisible();
  });
});
