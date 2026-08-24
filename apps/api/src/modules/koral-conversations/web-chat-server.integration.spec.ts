import { randomUUID } from "node:crypto";
import { type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
  ConversationChannel,
  ConversationIdentityAssurance,
  ConversationPriority,
  ConversationStatus,
  PrismaClient,
} from "@prisma/client";
import request from "supertest";
import { configureApp } from "../../bootstrap-app";
import { createTestPrismaClient } from "../../database/test-db-client";
import { RedisService } from "../../common/redis/redis.service";
import { RateLimiterService } from "../auth/rate-limiter.service";
import { ConversationIdentityBindingService } from "./conversation-identity-binding.service";
import { KoralIdentityResolutionService } from "./identity-resolution.service";
import { KoralConversationsService } from "./koral-conversations.service";
import { WebChatCryptoService } from "./web-chat-crypto.service";
import { WebChatMessageProcessingService } from "./web-chat-message-processing.service";
import { WebChatRequestGuard } from "./web-chat-request.guard";
import { KoralWebChatRuntimeAdapter } from "./web-chat-runtime.adapter";
import { WebChatServerService } from "./web-chat-server.service";
import { WebChatSessionService } from "./web-chat-session.service";
import { WebChatController } from "./web-chat.controller";

const TEST_KEY = "web-chat-security-integration-key-at-least-32-bytes";

describe("Koral Web Chat security boundary (integration, real Postgres + Redis)", () => {
  let prisma: PrismaClient;
  let redis: RedisService;
  let crypto: WebChatCryptoService;
  let sessions: WebChatSessionService;
  let conversations: KoralConversationsService;
  let server: WebChatServerService;
  let runtime: KoralWebChatRuntimeAdapter;
  let httpApp: INestApplication;
  let orchestratorRun: jest.Mock;
  const conversationIds: string[] = [];
  const userIds: string[] = [];

  const config = {
    get: jest.fn((name: string) => {
      if (name === "ENCRYPTION_KEY") return TEST_KEY;
      if (name === "REDIS_URL") return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
      if (name === "ADMIN_STEP_UP_TTL_SECONDS") return 300;
      if (name === "CORS_ORIGIN") return "http://localhost:5173";
      if (name === "TRUST_PROXY") return "false";
      if (name === "COOKIE_ACCESS_TOKEN_NAME") return "asodef_at";
      if (name === "COOKIE_REFRESH_TOKEN_NAME") return "asodef_rt";
      return undefined;
    }),
  };

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    redis = new RedisService(config as never);
    await redis.onModuleInit();
    crypto = new WebChatCryptoService(config as never);
    sessions = new WebChatSessionService(prisma as never, crypto);
    conversations = new KoralConversationsService(prisma as never);
    const identities = new KoralIdentityResolutionService(prisma as never, {} as never, config as never);
    const bindings = new ConversationIdentityBindingService(prisma as never);
    const processing = new WebChatMessageProcessingService(prisma as never);
    const limiter = new RateLimiterService(redis);
    orchestratorRun = jest.fn().mockResolvedValue({ kind: "WAITING", completedSteps: [], reasonCodes: [] });
    runtime = new KoralWebChatRuntimeAdapter(
      conversations,
      identities,
      bindings,
      processing,
      limiter,
      { run: orchestratorRun } as never,
    );
    server = new WebChatServerService(
      prisma as never,
      sessions,
      crypto,
      limiter,
      identities,
      bindings,
      conversations,
      runtime,
    );
    const testingModule = await Test.createTestingModule({
      controllers: [WebChatController],
      providers: [
        WebChatRequestGuard,
        { provide: WebChatServerService, useValue: server },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    httpApp = testingModule.createNestApplication();
    configureApp(httpApp as never);
    await httpApp.init();
  });

  afterEach(async () => {
    orchestratorRun.mockReset().mockResolvedValue({ kind: "WAITING", completedSteps: [], reasonCodes: [] });
    if (conversationIds.length > 0) {
      const where = { conversationId: { in: conversationIds } };
      const messages = await prisma.conversationMessage.findMany({ where, select: { id: true } });
      await prisma.conversationAttachment.deleteMany({ where: { messageId: { in: messages.map(({ id }) => id) } } });
      await prisma.conversationInternalNote.deleteMany({ where });
      await prisma.conversationEvent.deleteMany({ where });
      await prisma.conversationIdentityBinding.deleteMany({ where });
      await prisma.conversationAssignment.deleteMany({ where });
      await prisma.webChatMessageProcessing.deleteMany({
        where: { message: { conversationId: { in: conversationIds } } },
      });
      await prisma.conversationMessage.deleteMany({ where });
      await prisma.conversationParticipant.deleteMany({ where });
      await prisma.conversationTag.deleteMany({ where });
      await prisma.webChatSession.deleteMany({
        where: { channelSession: { conversationId: { in: conversationIds } } },
      });
      await prisma.conversationChannelSession.deleteMany({ where });
      await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      conversationIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => {
    await httpApp.close();
    await redis.onModuleDestroy();
    await prisma.$disconnect();
  });

  async function bootstrap() {
    const result = await server.bootstrap(undefined, `qa-${randomUUID()}`, randomUUID());
    conversationIds.push(result.session.channelSession.conversationId);
    return result;
  }

  function message(clientMessageId = randomUUID(), body = "Mensaje de prueba seguro") {
    return {
      version: "1.0.0" as const,
      clientMessageId,
      content: { type: "text/plain" as const, body },
    };
  }

  it("rotates a valid pre-seeded capability without changing its server session", async () => {
    const first = await bootstrap();
    const internalConversationId = first.session.channelSession.conversationId;
    const firstDigest = crypto.tokenDigest(first.rawToken);

    const rotated = await server.bootstrap(first.rawToken, `qa-${randomUUID()}`, randomUUID());

    expect(rotated.created).toBe(false);
    expect(rotated.session.id).toBe(first.session.id);
    expect(rotated.rawToken).not.toBe(first.rawToken);
    expect(rotated.session.tokenDigest).not.toBe(firstDigest);
    expect(JSON.stringify(rotated.snapshot)).not.toContain(internalConversationId);
    await expect(sessions.authenticate(first.rawToken)).rejects.toMatchObject({ status: 401 });
    await expect(sessions.authenticate(rotated.rawToken)).resolves.toMatchObject({ id: first.session.id });
    expect(await prisma.webChatSession.count({ where: { id: first.session.id } })).toBe(1);
  });

  it("serializes concurrent bootstrap rotation without forking the conversation", async () => {
    const first = await bootstrap();
    const results = await Promise.allSettled([
      server.bootstrap(first.rawToken, `qa-${randomUUID()}`, randomUUID()),
      server.bootstrap(first.rawToken, `qa-${randomUUID()}`, randomUUID()),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected"))
      .toMatchObject({ status: "rejected", reason: expect.objectContaining({ status: 401 }) });
    expect(await prisma.webChatSession.count({
      where: { channelSession: { conversationId: first.session.channelSession.conversationId } },
    })).toBe(1);
    expect(await prisma.conversationEvent.count({
      where: { conversationId: first.session.channelSession.conversationId, eventType: "WEB_CHAT_SESSION_ROTATED" },
    })).toBe(1);
  });

  it("isolates two cookie capabilities and rejects a cursor bound to the other session", async () => {
    const [first, second] = await Promise.all([bootstrap(), bootstrap()]);
    const body = `session-a-${randomUUID()}`;
    await server.send(first.rawToken, message(randomUUID(), body), randomUUID(), `qa-${randomUUID()}`);

    const secondHistory = await server.history(second.rawToken, undefined, `qa-${randomUUID()}`);
    expect(JSON.stringify(secondHistory)).not.toContain(body);
    expect(secondHistory.messages).toHaveLength(0);

    const crossSessionCursor = crypto.encodeCursor({
      sessionId: first.session.id,
      occurredAt: new Date().toISOString(),
      messageId: first.session.channelSession.id,
    });
    const clientVisibleDecodedSegments = crossSessionCursor
      .split(".")
      .map((segment) => Buffer.from(segment, "base64url").toString("utf8"))
      .join("\n");
    expect(crossSessionCursor).not.toContain(first.session.id);
    expect(crossSessionCursor).not.toContain(first.session.channelSession.id);
    expect(clientVisibleDecodedSegments).not.toContain(first.session.id);
    expect(clientVisibleDecodedSegments).not.toContain(first.session.channelSession.id);
    await expect(server.history(second.rawToken, crossSessionCursor, `qa-${randomUUID()}`))
      .rejects.toMatchObject({
        status: 400,
        response: { code: "INVALID_WEB_CHAT_CURSOR" },
      });
  });

  it("commits one inbound row for concurrent identical retries", async () => {
    const session = await bootstrap();
    const clientMessageId = randomUUID();
    const dto = message(clientMessageId);

    const [first, replay] = await Promise.all([
      server.send(session.rawToken, dto, randomUUID(), `qa-${randomUUID()}`),
      server.send(session.rawToken, dto, randomUUID(), `qa-${randomUUID()}`),
    ]);

    expect(first.messages.find((item) => item.clientMessageId === clientMessageId)).toBeDefined();
    expect(replay.messages.find((item) => item.clientMessageId === clientMessageId)).toBeDefined();
    expect(await prisma.conversationMessage.count({
      where: { channelSessionId: session.session.channelSessionId, externalMessageId: clientMessageId },
    })).toBe(1);
    expect(await prisma.conversationEvent.count({
      where: { conversationId: session.session.channelSession.conversationId, eventType: "MESSAGE_RECEIVED" },
    })).toBe(1);
  });

  it("rejects concurrent idempotency payload drift while preserving exactly one payload", async () => {
    const session = await bootstrap();
    const clientMessageId = randomUUID();
    const results = await Promise.allSettled([
      server.send(session.rawToken, message(clientMessageId, "payload-a"), randomUUID(), `qa-${randomUUID()}`),
      server.send(session.rawToken, message(clientMessageId, "payload-b"), randomUUID(), `qa-${randomUUID()}`),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.objectContaining({ status: 409 }) });
    const persisted = await prisma.conversationMessage.findMany({
      where: { channelSessionId: session.session.channelSessionId, externalMessageId: clientMessageId },
      select: { body: true },
    });
    expect(persisted).toHaveLength(1);
    expect(["payload-a", "payload-b"]).toContain(persisted[0]?.body);
  });

  it("fails closed for idle/absolute expiry, idempotent revocation and malformed capabilities", async () => {
    const expired = await bootstrap();
    await prisma.webChatSession.update({
      where: { id: expired.session.id },
      data: { idleExpiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(server.history(expired.rawToken, undefined, `qa-${randomUUID()}`)).rejects.toMatchObject({ status: 401 });

    const absoluteExpired = await bootstrap();
    await prisma.webChatSession.update({
      where: { id: absoluteExpired.session.id },
      data: {
        idleExpiresAt: new Date(Date.now() - 2_000),
        absoluteExpiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(server.history(absoluteExpired.rawToken, undefined, `qa-${randomUUID()}`)).rejects.toMatchObject({ status: 401 });

    const revoked = await bootstrap();
    await sessions.revoke(revoked.rawToken);
    await sessions.revoke(revoked.rawToken);
    await expect(server.history(revoked.rawToken, undefined, `qa-${randomUUID()}`)).rejects.toMatchObject({ status: 401 });
    expect(await prisma.conversationEvent.count({
      where: { conversationId: revoked.session.channelSession.conversationId, eventType: "WEB_CHAT_SESSION_REVOKED" },
    })).toBe(1);
    await expect(server.history("not-a-capability", undefined, `qa-${randomUUID()}`)).rejects.toMatchObject({ status: 401 });
  });

  it("fails closed before creating a session when the real Redis dependency is unavailable", async () => {
    const unavailableConfig = {
      get: jest.fn((name: string) => name === "REDIS_URL" ? "redis://127.0.0.1:1" : TEST_KEY),
    };
    const unavailableRedis = new RedisService(unavailableConfig as never);
    // This isolated client represents a hard outage. Disable background
    // reconnect only for the test client so Jest cannot retain a retry timer.
    unavailableRedis.getClient().options.retryStrategy = () => null;
    const unavailableServer = new WebChatServerService(
      prisma as never,
      sessions,
      crypto,
      new RateLimiterService(unavailableRedis),
      new KoralIdentityResolutionService(prisma as never, {} as never, config as never),
      new ConversationIdentityBindingService(prisma as never),
      conversations,
      runtime,
    );
    const before = await prisma.webChatSession.count();
    try {
      await expect(unavailableServer.bootstrap(undefined, `qa-${randomUUID()}`, randomUUID()))
        .rejects.toMatchObject({ status: 503 });
      expect(await prisma.webChatSession.count()).toBe(before);
    } finally {
      unavailableRedis.getClient().disconnect(false);
    }
  });

  it("enforces the real HTTP cookie boundary and rotates it without exposing an internal identifier", async () => {
    const originHeaders = { Origin: "http://localhost:5173", "Sec-Fetch-Site": "same-origin" };
    const first = await request(httpApp.getHttpServer())
      .post("/api/v1/koral/web-chat/bootstrap")
      .set(originHeaders)
      .send({ version: "1.0.0" })
      .expect(200);
    const firstCookie = first.headers["set-cookie"]?.[0];
    expect(firstCookie).toBeDefined();
    expect(firstCookie).toContain("__Host-asodef_koral_web=");
    expect(firstCookie).toContain("HttpOnly");
    expect(firstCookie).toContain("Secure");
    expect(firstCookie).toContain("SameSite=Strict");
    expect(firstCookie).toContain("Path=/");
    expect(firstCookie).not.toContain("Domain=");
    expect(first.body.conversation).not.toHaveProperty("id");
    const persisted = await prisma.webChatSession.findFirst({ orderBy: { createdAt: "desc" }, include: { channelSession: true } });
    expect(persisted).not.toBeNull();
    conversationIds.push(persisted!.channelSession.conversationId);
    expect(JSON.stringify(first.body)).not.toContain(persisted!.channelSession.conversationId);
    const maxAgeSeconds = Number(/Max-Age=(\d+)/u.exec(firstCookie!)?.[1]);
    expect(maxAgeSeconds).toBeGreaterThan(0);
    expect(maxAgeSeconds).toBeLessThanOrEqual(86_400);

    const rotated = await request(httpApp.getHttpServer())
      .post("/api/v1/koral/web-chat/bootstrap")
      .set(originHeaders)
      .set("Cookie", firstCookie!.split(";")[0]!)
      .send({ version: "1.0.0" })
      .expect(200);
    const rotatedCookie = rotated.headers["set-cookie"]?.[0];
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie!.split(";")[0]).not.toBe(firstCookie!.split(";")[0]);
    await request(httpApp.getHttpServer())
      .get("/api/v1/koral/web-chat/history")
      .set("Cookie", firstCookie!.split(";")[0]!)
      .expect(401)
      .expect("set-cookie", /Expires=Thu, 01 Jan 1970/u);
    await request(httpApp.getHttpServer())
      .get("/api/v1/koral/web-chat/history")
      .set("Cookie", rotatedCookie!.split(";")[0]!)
      .expect(200);
  });

  it("rejects a send whose authenticated generation is revoked before persistence", async () => {
    const session = await bootstrap();
    const originalReceive = runtime.receive.bind(runtime);
    let releaseReceive!: () => void;
    let markAuthenticated!: () => void;
    const authenticated = new Promise<void>((resolve) => { markAuthenticated = resolve; });
    const gate = new Promise<void>((resolve) => { releaseReceive = resolve; });
    const receiveSpy = jest.spyOn(runtime, "receive").mockImplementationOnce(async (input, now) => {
      markAuthenticated();
      await gate;
      return originalReceive(input, now);
    });
    const clientMessageId = randomUUID();
    const sendPromise = server.send(
      session.rawToken,
      message(clientMessageId),
      randomUUID(),
      `qa-${randomUUID()}`,
    );
    await authenticated;
    await sessions.revoke(session.rawToken);
    releaseReceive();
    await expect(sendPromise).rejects.toMatchObject({ status: 401 });
    receiveSpy.mockRestore();
    expect(orchestratorRun).not.toHaveBeenCalled();
    expect(await prisma.conversationMessage.count({
      where: { conversationId: session.session.channelSession.conversationId, externalMessageId: clientMessageId },
    })).toBe(0);
  });

  it("rejects a claim whose authenticated generation is revoked before its mutation", async () => {
    const session = await bootstrap();
    const originalAuthenticate = sessions.authenticate.bind(sessions);
    let releaseClaim!: () => void;
    let markAuthenticated!: () => void;
    const authenticated = new Promise<void>((resolve) => { markAuthenticated = resolve; });
    const gate = new Promise<void>((resolve) => { releaseClaim = resolve; });
    const authenticateSpy = jest.spyOn(sessions, "authenticate").mockImplementationOnce(async (token, now) => {
      const result = await originalAuthenticate(token, now);
      markAuthenticated();
      await gate;
      return result;
    });
    const claimPromise = server.claim(
      session.rawToken,
      { version: "1.0.0", clientClaimId: randomUUID(), displayName: "Claim revocado" },
      randomUUID(),
      `qa-${randomUUID()}`,
    );
    await authenticated;
    await sessions.revoke(session.rawToken);
    releaseClaim();
    await expect(claimPromise).rejects.toMatchObject({ status: 401 });
    authenticateSpy.mockRestore();
    const row = await prisma.webChatSession.findUniqueOrThrow({ where: { id: session.session.id } });
    expect(row).toMatchObject({ assuranceLevel: ConversationIdentityAssurance.ANONYMOUS, claimedDisplayName: null });
    expect(await prisma.conversationIdentityBinding.count({
      where: {
        conversationId: session.session.channelSession.conversationId,
        newAssurance: ConversationIdentityAssurance.CLAIMED,
      },
    })).toBe(0);
  });

  it("rolls back capability rotation when the transaction-bound snapshot fails", async () => {
    const session = await bootstrap();
    await expect(sessions.bootstrap(session.rawToken, randomUUID(), async () => {
      throw new Error("snapshot unavailable");
    }))
      .rejects.toThrow("snapshot unavailable");
    await expect(sessions.authenticate(session.rawToken)).resolves.toMatchObject({ id: session.session.id });
    expect(await prisma.conversationEvent.count({
      where: { conversationId: session.session.channelSession.conversationId, eventType: "WEB_CHAT_SESSION_ROTATED" },
    })).toBe(0);
  });

  it("marks an uncertain orchestration result durable and never retries it blindly", async () => {
    const session = await bootstrap();
    const dto = message();
    orchestratorRun.mockRejectedValueOnce(new Error("provider result unknown"));

    await expect(server.send(session.rawToken, dto, randomUUID(), `qa-${randomUUID()}`))
      .rejects.toThrow("provider result unknown");
    const processing = await prisma.webChatMessageProcessing.findFirstOrThrow({
      where: { webChatSessionId: session.session.id },
    });
    expect(processing).toMatchObject({ status: "UNKNOWN_RESULT", attemptCount: 1, outcomeClass: "INVOCATION_RESULT_UNKNOWN" });
    orchestratorRun.mockClear();

    const replay = await server.send(session.rawToken, dto, randomUUID(), `qa-${randomUUID()}`);
    expect(replay.messages.find(({ clientMessageId }) => clientMessageId === dto.clientMessageId)).toBeDefined();
    expect(orchestratorRun).not.toHaveBeenCalled();
    expect(await prisma.conversationMessage.count({
      where: { channelSessionId: session.session.channelSessionId, externalMessageId: dto.clientMessageId },
    })).toBe(1);
    expect(await prisma.webChatMessageProcessing.findUniqueOrThrow({ where: { id: processing.id } }))
      .toMatchObject({ status: "UNKNOWN_RESULT", attemptCount: 1 });
  });

  it.each([
    [ConversationStatus.HUMAN_REQUIRED, false],
    [ConversationStatus.HUMAN_ACTIVE, false],
    [ConversationStatus.AI_ACTIVE, true],
  ])("persists inbound but never invokes AI for %s with active-assignment=%s", async (status, activeAssignment) => {
    const session = await bootstrap();
    const conversationId = session.session.channelSession.conversationId;
    await prisma.conversation.update({ where: { id: conversationId }, data: { status } });
    if (activeAssignment) {
      const actor = await prisma.user.create({
        data: {
          email: `web-chat-qa-${randomUUID()}@example.invalid`,
          fullName: "Web Chat QA actor",
          passwordHash: "integration-only-not-a-real-password-hash",
          status: "ACTIVE",
        },
      });
      userIds.push(actor.id);
      await prisma.conversationAssignment.create({
        data: {
          conversationId,
          assigneeUserId: actor.id,
          assignedByUserId: actor.id,
          priority: ConversationPriority.NORMAL,
        },
      });
    }
    orchestratorRun.mockClear();
    const clientMessageId = randomUUID();

    const snapshot = await server.send(
      session.rawToken,
      message(clientMessageId),
      randomUUID(),
      `qa-${randomUUID()}`,
    );

    expect(orchestratorRun).not.toHaveBeenCalled();
    expect(snapshot.conversation.aiAutoReplyAllowed).toBe(false);
    expect(await prisma.conversationMessage.count({
      where: { conversationId, externalMessageId: clientMessageId },
    })).toBe(1);
  });

  it("lets a human takeover win while inference is pending and rejects a stale outbound commit", async () => {
    const session = await bootstrap();
    const conversationId = session.session.channelSession.conversationId;
    const actor = await prisma.user.create({
      data: {
        email: `web-chat-race-${randomUUID()}@example.invalid`,
        fullName: "Web Chat race actor",
        passwordHash: "integration-only-not-a-real-password-hash",
        status: "ACTIVE",
        roles: { create: { role: { connect: { name: "CUSTOMER_SERVICE" } } } },
      },
    });
    userIds.push(actor.id);
    let releaseInference!: () => void;
    const inferenceEntered = new Promise<void>((resolve) => {
      orchestratorRun.mockImplementationOnce(() => new Promise((release) => {
        releaseInference = () => release({ kind: "WAITING", completedSteps: [], reasonCodes: [] });
        resolve();
      }));
    });
    const sendPromise = server.send(
      session.rawToken,
      message(),
      randomUUID(),
      `qa-${randomUUID()}`,
    );
    await inferenceEntered;
    const stateBeforeTakeover = await conversations.getRuntimeState(conversationId);
    await conversations.assign(conversationId, {
      assigneeUserId: actor.id,
      priority: ConversationPriority.HIGH,
      expectedVersion: stateBeforeTakeover.version,
      idempotencyKey: randomUUID(),
      reason: "Security QA takeover",
    }, { actorUserId: actor.id, correlationId: randomUUID() });
    releaseInference();
    const snapshot = await sendPromise;

    expect(snapshot.conversation).toMatchObject({ status: ConversationStatus.HUMAN_ACTIVE, aiAutoReplyAllowed: false });
    await expect(conversations.commitKoralOutbound({
      conversationId,
      channel: ConversationChannel.WEB,
      externalSessionId: session.session.channelSession.externalSessionId,
      expectedVersion: stateBeforeTakeover.version,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      contentType: "text/plain",
      body: "Esta respuesta no debe persistirse",
    })).resolves.toMatchObject({ committed: false, reason: "CONVERSATION_NOT_AI_ACTIVE" });
    expect(await prisma.conversationMessage.count({
      where: { conversationId, direction: "OUTBOUND" },
    })).toBe(0);
  });

  it("allows only an idempotent ANONYMOUS to CLAIMED transition", async () => {
    const session = await bootstrap();
    const clientClaimId = randomUUID();
    const claim = { version: "1.0.0" as const, clientClaimId, displayName: "  Persona visitante  " };

    const first = await server.claim(session.rawToken, claim, randomUUID(), `qa-${randomUUID()}`);
    const replay = await server.claim(session.rawToken, claim, randomUUID(), `qa-${randomUUID()}`);

    expect(first.conversation.assuranceLevel).toBe(ConversationIdentityAssurance.CLAIMED);
    expect(replay.conversation.assuranceLevel).toBe(ConversationIdentityAssurance.CLAIMED);
    await expect(server.claim(
      session.rawToken,
      { ...claim, clientClaimId: randomUUID(), displayName: "Otra persona" },
      randomUUID(),
      `qa-${randomUUID()}`,
    )).rejects.toMatchObject({ status: 409 });
    await expect(server.claim(
      session.rawToken,
      { ...claim, clientClaimId: randomUUID(), displayName: "Nombre\u0000inválido" },
      randomUUID(),
      `qa-${randomUUID()}`,
    )).rejects.toMatchObject({ status: 409 });
    const bindings = await prisma.conversationIdentityBinding.findMany({
      where: { conversationId: session.session.channelSession.conversationId },
      select: { newAssurance: true },
      orderBy: { createdAt: "asc" },
    });
    expect(bindings.map(({ newAssurance }) => newAssurance)).toEqual([
      ConversationIdentityAssurance.ANONYMOUS,
      ConversationIdentityAssurance.CLAIMED,
    ]);
  });
});
