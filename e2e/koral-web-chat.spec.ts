import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";

const prisma = new PrismaClient();
const WEB_CHAT_COOKIE = "__Host-asodef_koral_web";
const BOOTSTRAP_PATH = "/api/v1/koral/web-chat/bootstrap";
const MESSAGES_PATH = "/api/v1/koral/web-chat/messages";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KNOWLEDGE_MARKER = `beneficio-koral-${randomUUID()
  .replaceAll("-", "")
  .replaceAll(/[0-9]/gu, "a")}`;
const CONFLICT_MARKER = `conflicto-koral-${randomUUID()
  .replaceAll("-", "")
  .replaceAll(/[0-9]/gu, "b")}`;
const knowledgeItemIds: string[] = [];

test.describe
  .serial("Koral public Web Chat — real browser/server boundary", () => {
  test.beforeAll(async () => {
    const content = `${KNOWLEDGE_MARKER} beneficios ASODEF publicados y verificables ${KNOWLEDGE_MARKER}`;
    knowledgeItemIds.push(
      await createPublishedKnowledgeFixture(KNOWLEDGE_MARKER, content),
      await createPublishedKnowledgeFixture(
        `${CONFLICT_MARKER}-a`,
        `${CONFLICT_MARKER} beneficios ASODEF con cobertura disponible`,
        [{ key: "cobertura-conflictiva", value: "Disponible" }],
      ),
      await createPublishedKnowledgeFixture(
        `${CONFLICT_MARKER}-b`,
        `${CONFLICT_MARKER} beneficios ASODEF con cobertura no disponible`,
        [{ key: "cobertura-conflictiva", value: "No disponible" }],
      ),
    );
  });

  test.afterAll(async () => {
    if (knowledgeItemIds.length > 0) {
      const versions = await prisma.knowledgeVersion.findMany({
        where: { knowledgeItemId: { in: knowledgeItemIds } },
        select: { id: true },
      });
      const versionIds = versions.map(({ id }) => id);
      await prisma.knowledgePublicationSnapshot.deleteMany({
        where: { knowledgeItemId: { in: knowledgeItemIds } },
      });
      await prisma.knowledgeChunk.deleteMany({
        where: { knowledgeVersionId: { in: versionIds } },
      });
      await prisma.knowledgeSource.deleteMany({
        where: { knowledgeVersionId: { in: versionIds } },
      });
      await prisma.knowledgeVersion.deleteMany({
        where: { id: { in: versionIds } },
      });
      await prisma.knowledgeItem.deleteMany({
        where: { id: { in: knowledgeItemIds } },
      });
    }
    await prisma.$disconnect();
  });

  test("persists the governed unavailable handoff, rotates history and suppresses AI while HUMAN_REQUIRED", async ({
    browser,
    page,
  }) => {
    const bootstrapResponse = page.waitForResponse((response) =>
      isApiResponse(response, "POST", BOOTSTRAP_PATH),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir chat con Koral" }).click();
    const initialBootstrap = await bootstrapResponse;
    expect(initialBootstrap.status()).toBe(200);

    const dialog = page.getByRole("dialog", { name: "Habla con Koral" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("¿En qué podemos ayudarte?")).toBeVisible();

    const initialCookie = await requiredSessionCookie(page.context());
    assertCookiePolicy(initialCookie);
    await assertCapabilityIsNotProjected(
      page,
      initialBootstrap,
      initialCookie.value,
    );

    const firstRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === MESSAGES_PATH,
    );
    const knowledgeQuestion = `¿Cuáles son los beneficios de ASODEF sobre ${KNOWLEDGE_MARKER}?`;
    await dialog.getByLabel("Escribe tu mensaje").fill(knowledgeQuestion);
    await dialog.getByRole("button", { name: "Enviar mensaje" }).click();
    const firstRequest = await firstRequestPromise;
    const firstResponse = await firstRequest.response();
    expect(firstResponse).not.toBeNull();
    expect(firstResponse!.status()).toBe(200);
    const firstPayload = firstRequest.postDataJSON() as unknown;
    const firstClientMessageId = clientMessageIdOf(firstPayload);

    await expect(
      dialog.getByText("Buscando un asesor", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(knowledgeQuestion, { exact: true })).toBeVisible();
    await assertCapabilityIsNotProjected(
      page,
      firstResponse!,
      initialCookie.value,
    );

    await expect
      .poll(async () => {
        const message = await prisma.conversationMessage.findFirst({
          where: { externalMessageId: firstClientMessageId },
          select: { id: true },
        });
        return message !== null;
      })
      .toBe(true);

    const firstInbound = await prisma.conversationMessage.findFirstOrThrow({
      where: { externalMessageId: firstClientMessageId },
      include: {
        webChatProcessing: true,
        channelSession: { include: { webChatSession: true } },
        conversation: true,
      },
    });
    expect(firstInbound.direction).toBe("INBOUND");
    expect(firstInbound.body).toBe(knowledgeQuestion);
    expect(firstInbound.channelSession?.channel).toBe("WEB");
    expect(firstInbound.webChatProcessing).toMatchObject({
      status: "COMPLETED",
      attemptCount: 1,
      outcomeClass: "ORCHESTRATED",
      failureCode: null,
    });
    expect(firstInbound.conversation.status).toBe("HUMAN_REQUIRED");
    const persistedSession = firstInbound.channelSession?.webChatSession;
    expect(persistedSession).not.toBeNull();
    expect(persistedSession?.tokenDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(persistedSession?.tokenDigest === initialCookie.value).toBe(false);

    const handoff = await prisma.conversationEvent.findFirstOrThrow({
      where: {
        conversationId: firstInbound.conversationId,
        eventType: "KORAL_HANDOFF_REQUIRED",
      },
    });
    expect(handoff.reason).toBe("PROVIDER_UNAVAILABLE,MODEL_NOT_AVAILABLE");
    expect(reasonCodesOf(handoff.metadata)).toEqual([
      "PROVIDER_UNAVAILABLE",
      "MODEL_NOT_AVAILABLE",
    ]);
    await expect(
      prisma.knowledgeRetrievalAudit.findFirstOrThrow({
        where: { correlationId: handoff.correlationId ?? "" },
      }),
    ).resolves.toMatchObject({
      result: "SUFFICIENT_EVIDENCE",
      citationCount: 1,
    });
    const evidenceReference = gatewayReferencesOf(handoff.metadata)[0];
    expect(evidenceReference).toMatch(
      /^knowledge-evidence:v1:[0-9a-f-]{36}:[0-9a-f-]{36}:ai:[0-9a-f-]{36}$/u,
    );
    expect(await outboundCount(firstInbound.conversationId)).toBe(0);

    const secondRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === MESSAGES_PATH,
    );
    const followUp = "Necesito que un asesor continúe esta conversación.";
    await dialog.getByLabel("Escribe tu mensaje").fill(followUp);
    await dialog.getByRole("button", { name: "Enviar mensaje" }).click();
    const secondRequest = await secondRequestPromise;
    const secondResponse = await secondRequest.response();
    expect(secondResponse).not.toBeNull();
    expect(secondResponse!.status()).toBe(200);
    const secondClientMessageId = clientMessageIdOf(
      secondRequest.postDataJSON() as unknown,
    );
    await expect(dialog.getByText(followUp, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText("Buscando un asesor", { exact: true }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const processing = await prisma.webChatMessageProcessing.findFirst({
          where: { message: { externalMessageId: secondClientMessageId } },
          select: { status: true },
        });
        return processing?.status ?? null;
      })
      .toBe("SUPPRESSED");

    const secondInbound = await prisma.conversationMessage.findFirstOrThrow({
      where: { externalMessageId: secondClientMessageId },
      include: { webChatProcessing: true },
    });
    expect(secondInbound.conversationId).toBe(firstInbound.conversationId);
    expect(secondInbound.direction).toBe("INBOUND");
    expect(secondInbound.body).toBe(followUp);
    expect(secondInbound.webChatProcessing).toMatchObject({
      status: "SUPPRESSED",
      attemptCount: 0,
      outcomeClass: "HUMAN_HANDOFF",
      failureCode: null,
    });
    expect(
      await prisma.conversationEvent.count({
        where: {
          conversationId: firstInbound.conversationId,
          eventType: "KORAL_HANDOFF_REQUIRED",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.conversationEvent.count({
        where: {
          conversationId: firstInbound.conversationId,
          eventType: "WEB_CHAT_PROCESSING_SUPPRESSED",
          metadata: { path: ["messageId"], equals: secondInbound.id },
        },
      }),
    ).toBe(1);
    expect(await outboundCount(firstInbound.conversationId)).toBe(0);

    const cookieDigestBeforeReload = digest(initialCookie.value);
    await page.reload();
    const resumedBootstrapPromise = page.waitForResponse((response) =>
      isApiResponse(response, "POST", BOOTSTRAP_PATH),
    );
    await page.getByRole("button", { name: "Abrir chat con Koral" }).click();
    const resumedBootstrap = await resumedBootstrapPromise;
    expect(resumedBootstrap.status()).toBe(200);
    const rotatedCookie = await requiredSessionCookie(page.context());
    assertCookiePolicy(rotatedCookie);
    expect(digest(rotatedCookie.value)).not.toBe(cookieDigestBeforeReload);
    await assertCapabilityIsNotProjected(
      page,
      resumedBootstrap,
      rotatedCookie.value,
    );

    const resumedDialog = page.getByRole("dialog", { name: "Habla con Koral" });
    await expect(
      resumedDialog.getByText(knowledgeQuestion, { exact: true }),
    ).toBeVisible();
    await expect(
      resumedDialog.getByText(followUp, { exact: true }),
    ).toBeVisible();
    await expect(
      resumedDialog.getByText("Buscando un asesor", { exact: true }),
    ).toBeVisible();
    await expect(
      resumedDialog.getByText("¿En qué podemos ayudarte?", { exact: true }),
    ).not.toBeVisible();
    expect(
      await prisma.webChatSession.count({
        where: {
          channelSession: { conversationId: firstInbound.conversationId },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.conversationMessage.count({
        where: {
          conversationId: firstInbound.conversationId,
          externalMessageId: {
            in: [firstClientMessageId, secondClientMessageId],
          },
        },
      }),
    ).toBe(2);
    expect(
      await prisma.webChatMessageProcessing.count({
        where: { message: { conversationId: firstInbound.conversationId } },
      }),
    ).toBe(2);
    expect(await outboundCount(firstInbound.conversationId)).toBe(0);

    await assertSecondBrowserIsIsolated(
      browser,
      [knowledgeQuestion, followUp],
      digest(rotatedCookie.value),
    );
  });

  test("propagates NO_EVIDENCE without inventing an outbound answer", async ({
    page,
  }) => {
    const question = `¿Cuáles son los beneficios de ASODEF sobre inexistente${randomUUID().replaceAll("-", "")}?`;
    const result = await sendPublicQuestion(page, question);
    expect(result.response.status()).toBe(200);
    await expect(result.dialog.getByText("Buscando un asesor", { exact: true })).toBeVisible();

    const persisted = await persistedInbound(result.clientMessageId);
    expect(persisted.webChatProcessing).toMatchObject({
      status: "COMPLETED",
      outcomeClass: "ORCHESTRATED",
    });
    expect(persisted.conversation.status).toBe("HUMAN_REQUIRED");
    const handoff = await handoffEvent(persisted.conversationId);
    expect(reasonCodesOf(handoff.metadata)).toEqual(["NO_EVIDENCE"]);
    await expect(retrievalAudit(handoff.correlationId)).resolves.toMatchObject({
      result: "NO_EVIDENCE",
      citationCount: 0,
    });
    expect(await outboundCount(persisted.conversationId)).toBe(0);
    expect(gatewayReferencesOf(handoff.metadata)).toEqual([]);
  });

  test("propagates SOURCE_CONFLICT without asking AI to choose a source", async ({
    page,
  }) => {
    const question = `¿Cuáles son los beneficios de ASODEF sobre ${CONFLICT_MARKER}?`;
    const result = await sendPublicQuestion(page, question);
    expect(result.response.status()).toBe(200);
    await expect(result.dialog.getByText("Buscando un asesor", { exact: true })).toBeVisible();

    const persisted = await persistedInbound(result.clientMessageId);
    expect(persisted.conversation.status).toBe("HUMAN_REQUIRED");
    const handoff = await handoffEvent(persisted.conversationId);
    expect(reasonCodesOf(handoff.metadata)).toEqual(["SOURCE_CONFLICT"]);
    await expect(retrievalAudit(handoff.correlationId)).resolves.toMatchObject({
      result: "SOURCE_CONFLICT",
      citationCount: 2,
    });
    expect(await outboundCount(persisted.conversationId)).toBe(0);
    expect(gatewayReferencesOf(handoff.metadata)).toHaveLength(2);
    for (const reference of gatewayReferencesOf(handoff.metadata)) {
      expect(reference).toMatch(
        /^knowledge-evidence:v1:[0-9a-f-]{36}:[0-9a-f-]{36}$/u,
      );
    }
  });
});

async function requiredSessionCookie(context: BrowserContext) {
  const cookie = (await context.cookies()).find(
    ({ name }) => name === WEB_CHAT_COOKIE,
  );
  expect(cookie).toBeDefined();
  return cookie!;
}

function assertCookiePolicy(
  cookie: Awaited<ReturnType<BrowserContext["cookies"]>>[number],
): void {
  expect(cookie.name).toBe(WEB_CHAT_COOKIE);
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(cookie.path).toBe("/");
  expect(cookie.domain.startsWith(".")).toBe(false);
  expect(cookie.value.length).toBeGreaterThanOrEqual(43);
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1_000);
}

async function assertCapabilityIsNotProjected(
  page: Page,
  response: Response,
  capability: string,
): Promise<void> {
  const responseBody = await response.text();
  const browserProjection = await page.evaluate(() => ({
    body: document.body.textContent ?? "",
    url: window.location.href,
    localStorage: Object.values(window.localStorage),
    sessionStorage: Object.values(window.sessionStorage),
  }));
  expect(responseBody.includes(capability)).toBe(false);
  expect(browserProjection.body.includes(capability)).toBe(false);
  expect(browserProjection.url.includes(capability)).toBe(false);
  expect(
    browserProjection.localStorage.some((value) => value.includes(capability)),
  ).toBe(false);
  expect(
    browserProjection.sessionStorage.some((value) =>
      value.includes(capability),
    ),
  ).toBe(false);
}

function clientMessageIdOf(payload: unknown): string {
  expect(payload).toEqual(
    expect.objectContaining({
      version: "1.0.0",
      clientMessageId: expect.any(String),
      content: expect.objectContaining({
        type: "text/plain",
        body: expect.any(String),
      }),
    }),
  );
  const clientMessageId = (payload as { clientMessageId: string })
    .clientMessageId;
  expect(UUID_PATTERN.test(clientMessageId)).toBe(true);
  return clientMessageId;
}

function reasonCodesOf(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  return (metadata as Record<string, unknown>).reasonCodes;
}

function gatewayReferencesOf(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return [];
  const references = (metadata as Record<string, unknown>).gatewayReferences;
  return Array.isArray(references)
    ? references.filter((reference): reference is string => typeof reference === "string")
    : [];
}

async function createPublishedKnowledgeFixture(
  marker: string,
  content: string,
  claims: readonly { key: string; value: string }[] = [],
): Promise<string> {
  const publisher = await prisma.user.findFirstOrThrow({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { name: "SUPER_ADMIN" } } },
    },
    select: { id: true },
  });
  const sourceChecksum = digest(content);
  const chunkChecksum = digest(content);
  const item = await prisma.knowledgeItem.create({
    data: {
      tenantKey: "ASODEF",
      stableKey: marker,
      createdById: publisher.id,
    },
  });
  const now = new Date();
  const version = await prisma.knowledgeVersion.create({
    data: {
      knowledgeItemId: item.id,
      version: 1,
      revision: 3,
      title: `Beneficios ASODEF ${marker}`,
      domain: "BENEFICIOS_Y_CONVENIOS",
      audience: "PUBLIC",
      classification: "PUBLIC",
      language: "es",
      content,
      status: "PUBLISHED",
      changeReason: "Fixture E2E publicado mediante estado canónico",
      createdById: publisher.id,
      reviewedById: publisher.id,
      approvedById: publisher.id,
      publishedById: publisher.id,
      reviewedAt: now,
      approvedAt: now,
      publishedAt: now,
    },
  });
  const source = await prisma.knowledgeSource.create({
    data: {
      knowledgeVersionId: version.id,
      sourceType: "MANUAL_AUTHORING",
      sourceReference: `manual://${marker}`,
      sourceOwner: "Equipo ASODEF",
      sourceChecksum,
    },
  });
  await prisma.knowledgeChunk.create({
    data: {
      knowledgeVersionId: version.id,
      ordinal: 0,
      content,
      checksumSha256: chunkChecksum,
      tokenEstimate: content.split(/\s+/u).length,
      metadata: { parser: "e2e-fixture", language: "es", claims },
    },
  });
  await prisma.knowledgePublicationSnapshot.create({
    data: {
      knowledgeVersionId: version.id,
      knowledgeItemId: item.id,
      sourceId: source.id,
      domain: "BENEFICIOS_Y_CONVENIOS",
      audience: "PUBLIC",
      classification: "PUBLIC",
      language: "es",
      sourceReference: source.sourceReference,
      sourceChecksum,
      chunkSetChecksum: digest(chunkChecksum),
      publishedById: publisher.id,
      publishedAt: now,
    },
  });
  return item.id;
}

async function sendPublicQuestion(page: Page, question: string) {
  const bootstrap = page.waitForResponse((response) =>
    isApiResponse(response, "POST", BOOTSTRAP_PATH),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir chat con Koral" }).click();
  expect((await bootstrap).status()).toBe(200);
  const dialog = page.getByRole("dialog", { name: "Habla con Koral" });
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST"
      && new URL(request.url()).pathname === MESSAGES_PATH,
  );
  await dialog.getByLabel("Escribe tu mensaje").fill(question);
  await dialog.getByRole("button", { name: "Enviar mensaje" }).click();
  const request = await requestPromise;
  const response = await request.response();
  expect(response).not.toBeNull();
  return {
    dialog,
    response: response!,
    clientMessageId: clientMessageIdOf(request.postDataJSON() as unknown),
  };
}

async function persistedInbound(clientMessageId: string) {
  await expect
    .poll(async () =>
      prisma.conversationMessage.count({
        where: { externalMessageId: clientMessageId },
      }),
    )
    .toBe(1);
  return prisma.conversationMessage.findFirstOrThrow({
    where: { externalMessageId: clientMessageId },
    include: { webChatProcessing: true, conversation: true },
  });
}

function handoffEvent(conversationId: string) {
  return prisma.conversationEvent.findFirstOrThrow({
    where: { conversationId, eventType: "KORAL_HANDOFF_REQUIRED" },
  });
}

function retrievalAudit(correlationId: string | null) {
  expect(correlationId).not.toBeNull();
  return prisma.knowledgeRetrievalAudit.findFirstOrThrow({
    where: { correlationId: correlationId! },
  });
}

function outboundCount(conversationId: string): Promise<number> {
  return prisma.conversationMessage.count({
    where: { conversationId, direction: "OUTBOUND" },
  });
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function assertSecondBrowserIsIsolated(
  browser: Browser,
  privateMessages: readonly string[],
  firstCookieDigest: string,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const bootstrapResponse = page.waitForResponse((response) =>
      isApiResponse(response, "POST", BOOTSTRAP_PATH),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir chat con Koral" }).click();
    expect((await bootstrapResponse).status()).toBe(200);
    const dialog = page.getByRole("dialog", { name: "Habla con Koral" });
    await expect(dialog.getByText("¿En qué podemos ayudarte?")).toBeVisible();
    for (const message of privateMessages) {
      await expect(dialog.getByText(message, { exact: true })).toHaveCount(0);
    }
    const cookie = await requiredSessionCookie(context);
    assertCookiePolicy(cookie);
    expect(digest(cookie.value)).not.toBe(firstCookieDigest);
  } finally {
    await context.close();
  }
}

function isApiResponse(
  response: Response,
  method: string,
  path: string,
): boolean {
  return (
    response.request().method() === method &&
    new URL(response.url()).pathname === path
  );
}
