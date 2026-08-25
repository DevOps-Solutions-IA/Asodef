import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const MESSAGES_PATH = "/api/v1/koral/web-chat/messages";
const LOCAL_PREVIEW_KNOWLEDGE_QUERY =
  "¿Qué información de beneficios publica ASODEF en este entorno de revisión?";

test.describe.serial("Local Preview manual-review Web Chat", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("answers a canonical greeting in a fresh AI_ACTIVE conversation", async ({
    page,
  }) => {
    const result = await sendMessage(page, "hola");
    await expect(result.dialog.getByText("Koral espera tu respuesta")).toBeVisible();
    await expect(result.dialog.locator("ol").getByText("Koral", { exact: true })).toBeVisible();
    await expect(result.dialog.getByText("Se requiere atención de un asesor")).toHaveCount(0);
    await assertRealKoralOutbound(result.clientMessageId, false);
  });

  test("answers the review query from canonical published Local Preview evidence", async ({
    page,
  }) => {
    const result = await sendMessage(page, LOCAL_PREVIEW_KNOWLEDGE_QUERY);
    await expect(result.dialog.getByText("Koral espera tu respuesta")).toBeVisible();
    await expect(result.dialog.locator("ol").getByText("Koral", { exact: true })).toBeVisible();
    await assertRealKoralOutbound(result.clientMessageId, true);
  });
});

async function sendMessage(page: Page, body: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir chat con Koral" }).click();
  const dialog = page.getByRole("dialog", { name: "Habla con Koral" });
  await expect(dialog.getByText("Koral disponible")).toBeVisible();
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === MESSAGES_PATH,
  );
  await dialog.getByLabel("Escribe tu mensaje").fill(body);
  await dialog.getByRole("button", { name: "Enviar mensaje" }).click();
  const request = await requestPromise;
  const response = await request.response();
  expect(response?.status()).toBe(200);
  const payload = request.postDataJSON() as { clientMessageId?: unknown };
  expect(payload.clientMessageId).toEqual(expect.any(String));
  return {
    dialog,
    clientMessageId: payload.clientMessageId as string,
  };
}

async function assertRealKoralOutbound(
  clientMessageId: string,
  knowledgeRequired: boolean,
): Promise<void> {
  await expect
    .poll(async () =>
      prisma.conversationMessage.findFirst({
        where: { externalMessageId: clientMessageId },
        select: { conversationId: true },
      }),
    )
    .not.toBeNull();
  const inbound = await prisma.conversationMessage.findFirstOrThrow({
    where: { externalMessageId: clientMessageId },
    select: { conversationId: true, correlationId: true },
  });
  const outbound = await prisma.conversationMessage.findFirstOrThrow({
    where: {
      conversationId: inbound.conversationId,
      direction: "OUTBOUND",
      correlationId: inbound.correlationId,
    },
    select: { status: true, body: true },
  });
  expect(outbound.status).toBe("SENT");
  expect(outbound.body?.trim().length).toBeGreaterThan(0);
  const event = await prisma.conversationEvent.findFirstOrThrow({
    where: {
      conversationId: inbound.conversationId,
      correlationId: inbound.correlationId,
      eventType: "KORAL_RESPONSE_SENT",
    },
    select: { metadata: true },
  });
  const metadata = event.metadata as { gatewayReferences?: unknown };
  const references = Array.isArray(metadata.gatewayReferences)
    ? metadata.gatewayReferences.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  expect(references.length).toBeGreaterThan(0);
  if (knowledgeRequired) {
    expect(
      references.some((reference) =>
        reference.startsWith("knowledge-evidence:v1:"),
      ),
    ).toBe(true);
  }
}
