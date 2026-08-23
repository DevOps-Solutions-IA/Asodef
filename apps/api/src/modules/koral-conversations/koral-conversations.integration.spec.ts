import { randomUUID } from "node:crypto";
import { ConversationChannel, ConversationPriority, ConversationStatus, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { KORAL_CHANNEL_CONTRACT_VERSION, type InboundMessage } from "./contracts/channel.contract";
import { KoralConversationsService } from "./koral-conversations.service";

describe("Koral conversation foundation (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  let service: KoralConversationsService;
  const conversationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    service = new KoralConversationsService(prisma as never);
  });

  afterEach(async () => {
    if (conversationIds.length > 0) {
      const where = { conversationId: { in: conversationIds } };
      const messages = await prisma.conversationMessage.findMany({ where, select: { id: true } });
      await prisma.conversationAttachment.deleteMany({ where: { messageId: { in: messages.map((message) => message.id) } } });
      await prisma.conversationInternalNote.deleteMany({ where });
      await prisma.conversationEvent.deleteMany({ where });
      await prisma.conversationIdentityBinding.deleteMany({ where });
      await prisma.conversationAssignment.deleteMany({ where });
      await prisma.conversationMessage.deleteMany({ where });
      await prisma.conversationParticipant.deleteMany({ where });
      await prisma.conversationTag.deleteMany({ where });
      await prisma.conversationChannelSession.deleteMany({ where });
      await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      conversationIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => prisma.$disconnect());

  function inbound(externalSessionId: string, externalMessageId: string, body = "contenido privado") : InboundMessage {
    return {
      version: KORAL_CHANNEL_CONTRACT_VERSION,
      channel: ConversationChannel.WEB,
      adapterVersion: "web-v1",
      externalSessionId,
      externalMessageId,
      identity: { channel: ConversationChannel.WEB, externalIdentityId: `visitor-${externalSessionId}` },
      occurredAt: new Date(),
      contentType: "text/plain",
      body,
      attachments: [],
      correlationId: randomUUID(),
    };
  }

  async function createActiveUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `koral-${label}-${randomUUID()}@example.com`,
        fullName: `Koral ${label}`,
        passwordHash: "integration-only-not-a-real-password-hash",
        status: "ACTIVE",
      },
    });
    userIds.push(user.id);
    return user;
  }

  it("preserves conversation continuity and idempotently accepts a duplicate externalMessageId", async () => {
    const sessionId = randomUUID();
    const message = inbound(sessionId, randomUUID());
    const [first, replay] = await Promise.all([service.receiveInbound(message), service.receiveInbound(message)]);
    conversationIds.push(first.conversationId);

    expect(first.conversationId).toBe(replay.conversationId);
    expect(first.messageId).toBe(replay.messageId);
    expect([first.duplicate, replay.duplicate].sort()).toEqual([false, true]);
    expect(await prisma.conversationMessage.count({ where: { conversationId: first.conversationId } })).toBe(1);
    expect(await prisma.conversationEvent.count({ where: { conversationId: first.conversationId, eventType: "MESSAGE_RECEIVED" } })).toBe(1);
  });

  it("does not leak message content into audit metadata and suppresses auto-reply while HUMAN_ACTIVE", async () => {
    const actor = await createActiveUser("actor");
    const sessionId = randomUUID();
    const first = await service.receiveInbound(inbound(sessionId, randomUUID(), "dato que no debe entrar al evento"));
    conversationIds.push(first.conversationId);
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });

    await service.assign(first.conversationId, {
      assigneeUserId: actor.id,
      priority: ConversationPriority.HIGH,
      expectedVersion: conversation.version,
      idempotencyKey: randomUUID(),
      reason: "Intervención humana requerida",
    }, { actorUserId: actor.id, requestId: randomUUID(), correlationId: randomUUID() });

    const receipt = await service.receiveInbound(inbound(sessionId, randomUUID()));
    expect(receipt.status).toBe(ConversationStatus.HUMAN_ACTIVE);
    expect(receipt.shouldAutoReply).toBe(false);
    const events = await prisma.conversationEvent.findMany({ where: { conversationId: first.conversationId } });
    expect(JSON.stringify(events.map((event) => event.metadata))).not.toContain("dato que no debe entrar al evento");
  });

  it("uses optimistic concurrency and the active-assignment constraint to prevent split ownership", async () => {
    const [actor, firstAssignee, secondAssignee] = await Promise.all([
      createActiveUser("actor"),
      createActiveUser("first-assignee"),
      createActiveUser("second-assignee"),
    ]);
    const conversation = await prisma.conversation.create({ data: { status: ConversationStatus.HUMAN_REQUIRED } });
    conversationIds.push(conversation.id);

    const base = { priority: ConversationPriority.URGENT, expectedVersion: conversation.version, reason: "Concurrent handoff" };
    const results = await Promise.allSettled([
      service.assign(conversation.id, { ...base, assigneeUserId: firstAssignee.id, idempotencyKey: randomUUID() }, { actorUserId: actor.id }),
      service.assign(conversation.id, { ...base, assigneeUserId: secondAssignee.id, idempotencyKey: randomUUID() }, { actorUserId: actor.id }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.conversationAssignment.count({ where: { conversationId: conversation.id, releasedAt: null } })).toBe(1);
    expect(await prisma.conversationEvent.count({ where: { conversationId: conversation.id, eventType: "ASSIGNMENT_CREATED" } })).toBe(1);
  });

  it("lets a concurrent human takeover suppress an AI outbound commit", async () => {
    const actor = await createActiveUser("takeover-actor");
    const externalSessionId = randomUUID();
    const receipt = await service.receiveInbound(inbound(externalSessionId, randomUUID()));
    conversationIds.push(receipt.conversationId);
    const beforeTakeover = await service.getRuntimeState(receipt.conversationId);
    await service.assign(receipt.conversationId, {
      assigneeUserId: actor.id,
      priority: ConversationPriority.HIGH,
      expectedVersion: beforeTakeover.version,
      idempotencyKey: randomUUID(),
      reason: "Human takeover before inference completed",
    }, { actorUserId: actor.id });

    const result = await service.commitKoralOutbound({
      conversationId: receipt.conversationId,
      channel: ConversationChannel.WEB,
      externalSessionId,
      expectedVersion: beforeTakeover.version,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      contentType: "text/plain",
      body: "This response must never be committed",
    });
    expect(result).toMatchObject({ committed: false, reason: "CONVERSATION_NOT_AI_ACTIVE" });
    expect(await prisma.conversationMessage.count({ where: { conversationId: receipt.conversationId, direction: "OUTBOUND" } })).toBe(0);
  });

  it("queues an AI response once and rejects idempotency-key reuse with different content", async () => {
    const externalSessionId = randomUUID();
    const receipt = await service.receiveInbound(inbound(externalSessionId, randomUUID()));
    conversationIds.push(receipt.conversationId);
    const state = await service.getRuntimeState(receipt.conversationId);
    const idempotencyKey = randomUUID();
    const request = {
      conversationId: receipt.conversationId,
      channel: ConversationChannel.WEB,
      externalSessionId,
      expectedVersion: state.version,
      idempotencyKey,
      correlationId: randomUUID(),
      contentType: "text/plain",
      body: "Respuesta validada",
    };
    const first = await service.commitKoralOutbound(request);
    const replay = await service.commitKoralOutbound(request);
    expect(first).toMatchObject({ committed: true, replayed: false });
    expect(replay).toMatchObject({ committed: true, replayed: true, messageId: first.messageId });
    await expect(service.commitKoralOutbound({ ...request, body: "Contenido diferente" })).rejects.toThrow("idempotencia");
    expect(await prisma.conversationMessage.count({ where: { conversationId: receipt.conversationId, direction: "OUTBOUND" } })).toBe(1);
    expect(await prisma.conversationEvent.count({ where: { conversationId: receipt.conversationId, eventType: "KORAL_RESPONSE_QUEUED" } })).toBe(1);
  });

  it("replays only an identical idempotent mutation and rejects key reuse with a different payload", async () => {
    const actor = await createActiveUser("idempotency-actor");
    const conversation = await prisma.conversation.create({ data: { status: ConversationStatus.HUMAN_REQUIRED } });
    conversationIds.push(conversation.id);
    const idempotencyKey = randomUUID();
    const assignment = {
      assigneeUserId: actor.id,
      priority: ConversationPriority.NORMAL,
      expectedVersion: conversation.version,
      idempotencyKey,
      reason: "Identical retry",
    };

    await service.assign(conversation.id, assignment, { actorUserId: actor.id });
    await expect(service.assign(conversation.id, assignment, { actorUserId: actor.id })).resolves.toMatchObject({ id: conversation.id });
    await expect(
      service.assign(conversation.id, { ...assignment, priority: ConversationPriority.HIGH }, { actorUserId: actor.id }),
    ).rejects.toThrow("idempotencia");
    expect(await prisma.conversationAssignment.count({ where: { conversationId: conversation.id } })).toBe(1);

    const noteKey = randomUUID();
    await service.addInternalNote(conversation.id, { body: "Nota segura", idempotencyKey: noteKey }, { actorUserId: actor.id });
    await expect(
      service.addInternalNote(conversation.id, { body: "Nota segura", idempotencyKey: noteKey }, { actorUserId: actor.id }),
    ).resolves.toMatchObject({ body: "Nota segura" });
    await expect(
      service.addInternalNote(conversation.id, { body: "Contenido diferente", idempotencyKey: noteKey }, { actorUserId: actor.id }),
    ).rejects.toThrow("idempotencia");
    expect(await prisma.conversationInternalNote.count({ where: { conversationId: conversation.id } })).toBe(1);
  });
});
