import { expect, test } from "@playwright/test";
import { adminRecoveryCode, loginPrivilegedAdmin } from "./support/admin-auth";
import {
  PRIVILEGED_TEST_EMAIL,
  createRevokablePrivilegedTestSession,
  disconnectTestActorsClient,
  ensureTestActor,
  expirePrivilegedTestStepUpAssurance,
  getPrivilegedTestPassword,
} from "./support/test-actors";

test.use({ trace: "off" });

test.describe("single-admin control plane (real E2E)", () => {
  test.beforeAll(async () => {
    await ensureTestActor(PRIVILEGED_TEST_EMAIL, "E2E Control Plane Administrator", "SUPER_ADMIN");
  });

  test.afterAll(async () => disconnectTestActorsClient());

  test("completes MFA login, reads the four administrative surfaces, and performs real step-up", async ({ page }) => {
    const revokableSessionId = await createRevokablePrivilegedTestSession();
    await loginPrivilegedAdmin(page, { kind: "totp" });
    expect(await expirePrivilegedTestStepUpAssurance()).toBeGreaterThan(0);

    await page.goto("/admin/sesiones");
    await expect(page.getByRole("heading", { name: "Sesiones de mi cuenta" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Sesiones del usuario" })).toBeVisible();
    await expect(page.getByText("Sesión actual", { exact: true })).toBeVisible();
    const revokableRow = page.getByRole("row").filter({ hasText: "E2E revocation target" });
    await revokableRow.getByRole("button", { name: "Revocar" }).click();
    const reasonDialog = page.getByRole("dialog", { name: "Revocar sesión" });
    await reasonDialog.getByLabel("Motivo", { exact: false }).fill("Validación E2E de step-up administrativo");
    await reasonDialog.getByRole("button", { name: "Revocar" }).click();
    const stepUpDialog = page.getByRole("dialog", { name: "Confirma tu identidad" });
    await expect(stepUpDialog).toBeVisible();
    await stepUpDialog.getByLabel("Contraseña actual", { exact: false }).fill(getPrivilegedTestPassword());
    await stepUpDialog.getByLabel("Código de verificación", { exact: false }).fill(adminRecoveryCode(5));
    const retriedRevocation = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/sessions/revoke"),
      { timeout: 15_000 },
    );
    await stepUpDialog.getByRole("button", { name: "Continuar" }).click();
    expect((await retriedRevocation).status()).toBe(200);
    await expect(reasonDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(revokableRow.getByText("Revocada", { exact: true })).toBeVisible();
    expect(revokableSessionId).toBeTruthy();

    await page.goto("/admin/auditoria");
    await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();
    await expect(page.getByText(/eventos encontrados|Sin eventos/u)).toBeVisible();

    await page.goto("/admin/sistema");
    await expect(page.getByRole("heading", { name: "Estado del sistema" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dependencias" })).toBeVisible();

    await page.goto("/admin/seguridad");
    await expect(page.getByRole("heading", { name: "Seguridad de mi cuenta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Autenticación multifactor" })).toBeVisible();
    await expect(page.getByText("Activa", { exact: true })).toBeVisible();
  });
});
