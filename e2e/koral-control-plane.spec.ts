import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  adminRecoveryCode,
  currentPrivilegedSessionId,
  loginPrivilegedAdmin,
} from "./support/admin-auth";
import {
  PRIVILEGED_TEST_EMAIL,
  disconnectTestActorsClient,
  ensureTestActor,
  expirePrivilegedTestStepUpAssurance,
  getPrivilegedTestPassword,
} from "./support/test-actors";

const prisma = new PrismaClient();
const ADMIN_NAME = "E2E Koral Control Plane Administrator";
const AUTOMATION_MARKER = `koral-control-plane-e2e-${randomUUID()}`;

test.describe.serial("Koral Control Plane truth-first (real E2E)", () => {
  test.beforeAll(async () => {
    await ensureTestActor(PRIVILEGED_TEST_EMAIL, ADMIN_NAME, "SUPER_ADMIN");
    automationFixture("create");
  });

  test.afterAll(async () => {
    automationFixture("cleanup");
    await prisma.$disconnect();
    await disconnectTestActorsClient();
  });

  test("renders every visible Koral destination from its real server projection", async ({ page }) => {
    await loginPrivilegedAdmin(page, { kind: "recovery", index: 2 });

    const destinations = [
      ["/admin/koral/resumen", "/admin/koral/control-plane", "Resumen"],
      ["/admin/koral/conversaciones", "/admin/koral/conversations", "Conversaciones"],
      ["/admin/koral/inbox", "/admin/koral/conversations", "Inbox"],
      ["/admin/koral/conocimiento", "/admin/knowledge/items", "Conocimiento"],
      ["/admin/koral/agentes", "/admin/koral/control-plane/runtime/agents", "Agentes"],
      ["/admin/koral/herramientas", "/admin/koral/control-plane/tools", "Herramientas"],
      ["/admin/koral/automatizaciones", "/admin/koral/control-plane/automations", "Automatizaciones"],
      ["/admin/koral/analitica", "/admin/koral/control-plane/analytics", "Analítica"],
    ] as const;

    for (const [route, apiPath, heading] of destinations) {
      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "GET"
        && new URL(response.url()).pathname.endsWith(apiPath),
      );
      await page.goto(route);
      expect((await responsePromise).status()).toBe(200);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.getByText("Runtime administrativo pendiente")).toHaveCount(0);
      await expect(page.getByText("Automation runtime NOT_CONFIGURED")).toHaveCount(0);
    }

    await page.goto("/admin/koral/automatizaciones");
    await expect(page.getByText(`Automation ${AUTOMATION_MARKER}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ejecuciones recientes" }).locator("xpath=..")).toContainText("SUCCEEDED");
    await page.goto("/admin/koral/analitica");
    await expect(page.getByRole("region", { name: "Ejecuciones de automatización" })).toContainText("SUCCEEDED");

    await expect(page.getByRole("link", { name: "Recomendaciones" })).toHaveCount(0);
    await page.goto("/admin/koral/herramientas");
    await expect(page.getByRole("button", { name: /ejecutar/iu })).toHaveCount(0);
    await expect(
      page.getByText("Ejecutables", { exact: true }).locator("xpath=.."),
    ).toContainText("0");
    await expect(
      page.getByRole("table", {
        name: "Catálogo gobernado de herramientas de Koral",
      }),
    ).toBeVisible();
  });

  test("reflects a real WebChat human handoff in Inbox and Conversaciones after a governed claim", async ({ browser }) => {
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const clientMessageId = randomUUID();
    const handoffMessage = `Necesito ayuda con mi contrato personal, referencia ${clientMessageId}`;
    try {
      await publicPage.goto("/");
      await publicPage.getByRole("button", { name: "Abrir chat con Koral" }).click();
      const dialog = publicPage.getByRole("dialog", { name: "Habla con Koral" });
      await dialog.getByLabel("Escribe tu mensaje").fill(handoffMessage);
      const messageResponse = publicPage.waitForResponse((response) =>
        response.request().method() === "POST"
        && new URL(response.url()).pathname.endsWith("/koral/web-chat/messages"),
      );
      await dialog.getByRole("button", { name: "Enviar mensaje" }).click();
      expect((await messageResponse).status()).toBe(200);
      await expect(dialog.getByText("Se requiere atención de un asesor", { exact: true })).toBeVisible();

      const inbound = await waitForInbound(handoffMessage);
      expect(inbound.conversation.status).toBe("HUMAN_REQUIRED");

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      try {
        await loginPrivilegedAdmin(adminPage, { kind: "recovery", index: 3 });
        expect(await expirePrivilegedTestStepUpAssurance(await currentPrivilegedSessionId(adminPage))).toBe(1);
        await openConversation(adminPage, "/admin/koral/inbox", inbound.conversationId);
        const privilegedActor = await prisma.user.findUniqueOrThrow({
          where: { email: PRIVILEGED_TEST_EMAIL },
          select: { id: true },
        });
        const detail = adminPage.getByRole("region", { name: "Detalle de conversación" });
        await detail
          .getByRole("combobox", { name: "Responsable", exact: true })
          .selectOption(privilegedActor.id);
        await detail.getByLabel("Motivo de la acción").fill(`Asignación E2E ${clientMessageId}`);
        await detail.getByRole("button", { name: "Asignar", exact: true }).click();
        const stepUp = adminPage.getByRole("dialog", { name: "Confirma tu identidad" });
        await stepUp.getByLabel("Contraseña actual", { exact: false }).fill(getPrivilegedTestPassword());
        await stepUp.getByLabel("Código de verificación", { exact: false }).fill(adminRecoveryCode(8));
        const assignment = adminPage.waitForResponse((response) =>
          response.request().method() === "POST"
          && new URL(response.url()).pathname.endsWith(`/admin/koral/conversations/${inbound.conversationId}/assignments`),
        );
        await stepUp.getByRole("button", { name: "Continuar" }).click();
        expect((await assignment).status()).toBe(200);
        await expect(
          detail.getByText("Atención humana", { exact: true }).first(),
        ).toBeVisible();

        await openConversation(adminPage, "/admin/koral/conversaciones", inbound.conversationId);
        const conversationDetail = adminPage.getByRole("region", {
          name: "Detalle de conversación",
        });
        await expect(
          conversationDetail.getByText("Atención humana", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          conversationDetail.getByText("Autorrespuesta de Koral deshabilitada"),
        ).toBeVisible();

        const persisted = await prisma.conversation.findUniqueOrThrow({
          where: { id: inbound.conversationId },
          include: { assignments: { where: { releasedAt: null } }, events: true },
        });
        expect(persisted.status).toBe("HUMAN_ACTIVE");
        expect(persisted.assignments).toHaveLength(1);
        expect(persisted.events.some(({ eventType }) => eventType === "ASSIGNMENT_CREATED")).toBe(true);
      } finally {
        await adminContext.close();
      }
    } finally {
      await publicContext.close();
    }
  });
});

async function openConversation(page: Page, route: string, conversationId: string): Promise<void> {
  const listResponse = page.waitForResponse((response) =>
    response.request().method() === "GET"
    && new URL(response.url()).pathname.endsWith("/admin/koral/conversations"),
  );
  await page.goto(route);
  expect((await listResponse).status()).toBe(200);
  const item = page.getByRole("button").filter({ hasText: `ID ${conversationId}` });
  await expect(item).toBeVisible();
  const detailResponse = page.waitForResponse((response) =>
    response.request().method() === "GET"
    && new URL(response.url()).pathname.endsWith(`/admin/koral/conversations/${conversationId}`),
  );
  await item.click();
  expect((await detailResponse).status()).toBe(200);
}

async function waitForInbound(body: string) {
  await expect.poll(async () => prisma.conversationMessage.count({ where: { body } })).toBeGreaterThan(0);
  return prisma.conversationMessage.findFirstOrThrow({
    where: { body },
    orderBy: { createdAt: "desc" },
    include: { conversation: true },
  });
}

function automationFixture(action: "create" | "cleanup"): void {
  execFileSync(
    "pnpm",
    ["--filter", "@asodef/api", "exec", "ts-node", "test/fixtures/koral-control-plane-automation.ts", action, AUTOMATION_MARKER],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "pipe",
    },
  );
}
