import { randomUUID } from "node:crypto";
import { ConversationChannel, ConversationMessageDirection, ConversationMessageStatus, ConversationPriority, ConversationStatus, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { KoralConversationsService } from "./koral-conversations.service";
import { ConversationQueueView, ConversationSlaState } from "./koral-conversations.types";

describe("Koral Human Inbox (integration, real Postgres)", () => {
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
    if (conversationIds.length) {
      const where = { conversationId: { in: conversationIds } };
      await prisma.conversationReadState.deleteMany({ where });
      await prisma.conversationEvent.deleteMany({ where });
      await prisma.conversationAssignment.deleteMany({ where });
      await prisma.conversationMessage.deleteMany({ where });
      await prisma.conversationParticipant.deleteMany({ where });
      await prisma.conversationChannelSession.deleteMany({ where });
      await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      conversationIds.length = 0;
    }
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  afterAll(async () => prisma.$disconnect());

  async function user(roleName: "CUSTOMER_SERVICE" | "CUSTOMER") {
    const created = await prisma.user.create({
      data: {
        email: `inbox-${randomUUID()}@example.com`,
        fullName: roleName === "CUSTOMER_SERVICE" ? "Asesor Inbox" : "Usuario Portal",
        passwordHash: "integration-only-not-real",
        status: "ACTIVE",
        roles: { create: { role: { connect: { name: roleName } } } },
      },
    });
    userIds.push(created.id);
    return created;
  }

  async function conversation(subject: string, status = ConversationStatus.HUMAN_REQUIRED) {
    const created = await prisma.conversation.create({
      data: {
        subject,
        status,
        priority: ConversationPriority.HIGH,
        slaDueAt: new Date(Date.now() - 60_000),
        channelSessions: { create: { channel: ConversationChannel.WEB, externalSessionId: randomUUID(), adapterVersion: "web-v1" } },
      },
      include: { channelSessions: true },
    });
    conversationIds.push(created.id);
    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: created.id,
        channelSessionId: created.channelSessions[0]!.id,
        direction: ConversationMessageDirection.INBOUND,
        status: ConversationMessageStatus.RECEIVED,
        externalMessageId: randomUUID(),
        contentType: "text/plain",
        body: "dato visible solo en detalle",
        occurredAt: new Date(),
      },
    });
    return { created, message };
  }

  it("derives queue/SLA projections and persists an idempotent per-operator read cursor", async () => {
    const actor = await user("CUSTOMER_SERVICE");
    const { created, message } = await conversation("Solicitud funeraria");

    const list = await service.list({
      queue: ConversationQueueView.UNASSIGNED,
      slaState: ConversationSlaState.OVERDUE,
      search: "funeraria",
      page: 1,
      pageSize: 20,
    }, actor.id);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: created.id, queue: "UNASSIGNED", slaState: "OVERDUE", unread: true });

    const first = await service.markRead(created.id, actor.id);
    const replay = await service.markRead(created.id, actor.id);
    expect(replay).toEqual(first);
    const state = await prisma.conversationReadState.findUniqueOrThrow({ where: { conversationId_userId: { conversationId: created.id, userId: actor.id } } });
    expect(state.lastReadMessageId).toBe(message.id);
    expect((await service.list({ queue: ConversationQueueView.ALL, page: 1, pageSize: 20 }, actor.id)).items[0]?.unread).toBe(false);
  });

  it("lists only active permission-bearing assignees and rejects a portal user", async () => {
    const actor = await user("CUSTOMER_SERVICE");
    const portal = await user("CUSTOMER");
    const { created } = await conversation("Asignación segura");

    expect(await service.listEligibleAssignees()).toEqual(expect.arrayContaining([{ id: actor.id, displayName: actor.fullName }]));
    expect(await service.listEligibleAssignees()).not.toEqual(expect.arrayContaining([{ id: portal.id, displayName: portal.fullName }]));
    await expect(service.assign(created.id, {
      assigneeUserId: portal.id,
      priority: ConversationPriority.NORMAL,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    }, { actorUserId: actor.id })).rejects.toThrow("autorizado");
  });

});
