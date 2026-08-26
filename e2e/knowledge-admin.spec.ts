import { expect, test } from "@playwright/test";
import { adminRecoveryCode, currentPrivilegedSessionId, loginPrivilegedAdmin } from "./support/admin-auth";
import { PRIVILEGED_TEST_EMAIL, disconnectTestActorsClient, ensureTestActor, expirePrivilegedTestStepUpAssurance, getPrivilegedTestPassword } from "./support/test-actors";

test.describe("Knowledge V1 administrative lifecycle (real E2E)", () => {
  test.beforeAll(async () => ensureTestActor(PRIVILEGED_TEST_EMAIL, "E2E Knowledge Administrator", "SUPER_ADMIN"));
  test.afterAll(async () => disconnectTestActorsClient());

  test("creates, publishes, retrieves and retires governed evidence", async ({ page }) => {
    const marker = `knowledge-e2e-${Date.now()}`;
    await loginPrivilegedAdmin(page, { kind: "recovery", index: 4 });
    const rejectOptional = page.getByRole("button", { name: "Rechazar opcionales" });
    if (await rejectOptional.isVisible()) await rejectOptional.click();
    expect(
      await expirePrivilegedTestStepUpAssurance(
        await currentPrivilegedSessionId(page),
      ),
    ).toBe(1);
    const initialListRequest = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && new URL(response.url()).pathname.endsWith("/admin/knowledge/items"),
    );
    await page.goto("/admin/koral/conocimiento");
    expect((await initialListRequest).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Conocimiento" })).toBeVisible();
    await expect(page.getByText("RUNTIME REAL")).toBeVisible();
    if (process.env.LOCAL_PREVIEW === "true") {
      const previewKnowledgeItem = page.getByRole("button", { name: /^Beneficios de ASODEF\b/ });
      await expect(previewKnowledgeItem).toBeVisible();
      await expect(page.getByText("PUBLISHED", { exact: true }).first()).toBeVisible();
      await previewKnowledgeItem.click();
      await expect(page.getByRole("heading", { name: "Beneficios de ASODEF", exact: true })).toBeVisible();
    }

    const createSection = page.getByRole("heading", { name: "Crear DRAFT" }).locator("xpath=..");
    await createSection.getByLabel("Stable key").fill(marker);
    await createSection.getByLabel("Título").fill(`Conocimiento ${marker}`);
    await createSection.getByLabel("Contenido en español").fill(`${marker} evidencia institucional publicada y verificable`);
    await createSection.getByLabel("Motivo del cambio").fill("Creación E2E gobernada");
    await createSection.getByRole("button", { name: "Crear versión DRAFT" }).click();

    const stepUp = page.getByRole("dialog", { name: "Confirma tu identidad" });
    await expect(stepUp).toBeVisible();
    await stepUp.getByLabel("Contraseña actual", { exact: false }).fill(getPrivilegedTestPassword());
    await stepUp.getByLabel("Código de verificación", { exact: false }).fill(adminRecoveryCode(7));
    const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/admin/knowledge/versions/manual"));
    await stepUp.getByRole("button", { name: "Continuar" }).click();
    expect((await created).status()).toBe(201);
    await expect(page.getByRole("heading", { name: `Conocimiento ${marker}` })).toBeVisible();

    const reason = page.getByLabel("Motivo de lifecycle");
    await reason.fill("Enviar a revisión E2E");
    await page.getByRole("button", { name: "Enviar a REVIEW" }).click();
    await expect(page.getByText("REVIEW", { exact: true }).first()).toBeVisible();
    await reason.fill("Aprobación E2E");
    await page.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible();
    await reason.fill("Publicación E2E");
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByText("PUBLISHED", { exact: true }).first()).toBeVisible();

    await page.getByLabel("Retrieval Koral publicado").fill(marker);
    await page.getByRole("button", { name: "Consultar evidencia publicada" }).click();
    await expect(page.getByText("Outcome: SUFFICIENT_EVIDENCE")).toBeVisible();
    await expect(page.getByText(new RegExp(`${marker} evidencia institucional`))).toBeVisible();

    await reason.fill("Retiro E2E");
    await page.getByRole("button", { name: "Retirar", exact: true }).click();
    await expect(page.getByText("RETIRED", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Consultar evidencia publicada" }).click();
    await expect(page.getByText("Outcome: NO_EVIDENCE")).toBeVisible();
  });
});
