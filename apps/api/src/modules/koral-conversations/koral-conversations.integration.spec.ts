import { randomUUID } from "node:crypto";
import { ConversationChannel, ConversationPriority, ConversationStatus, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { KORAL_CHANNEL_CONTRACT_VERSION, type InboundMessage } from "./contracts/channel.contract";
import { IDENTITY_RESOLUTION_CONTRACT_VERSION } from "./contracts/identity-resolution.contract";
import { KORAL_ORCHESTRATOR_CONTRACT_VERSION } from "./contracts/orchestrator.contract";
import { KoralConversationsService } from "./koral-conversations.service";
import { GovernedKoralOrchestrationPipeline } from "./koral-orchestration.pipeline";
import { KnowledgeService } from "../knowledge/knowledge.service";
import { DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG } from "../knowledge/knowledge.tokens";
import { CanonicalKoralKnowledgeGatewayAdapter } from "./koral-gateway.adapters";

describe("Koral conversation foundation (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  let service: KoralConversationsService;
  const conversationIds: string[] = [];
  const userIds: string[] = [];
  const knowledgeItemIds: string[] = [];
  const knowledgeCorrelationPrefix = `koral-knowledge-${randomUUID()}`;

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
    if (knowledgeItemIds.length > 0) {
      const versions = await prisma.knowledgeVersion.findMany({
        where: { knowledgeItemId: { in: knowledgeItemIds } },
        select: { id: true },
      });
      const versionIds = versions.map(({ id }) => id);
      await prisma.knowledgePublicationSnapshot.deleteMany({
        where: { knowledgeItemId: { in: knowledgeItemIds } },
      });
      await prisma.knowledgeAuditEvent.deleteMany({
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
      knowledgeItemIds.length = 0;
    }
    await prisma.knowledgeRetrievalAudit.deleteMany({
      where: { correlationId: { startsWith: knowledgeCorrelationPrefix } },
    });
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
        roles: { create: { role: { connect: { name: "CUSTOMER_SERVICE" } } } },
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
    await expect(service.findById(first.conversationId, randomUUID())).resolves.toMatchObject({
      channels: [ConversationChannel.WEB],
      channelSessions: [expect.objectContaining({ channel: ConversationChannel.WEB })],
    });
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

  it("enforces state-machine transitions before assignment", async () => {
    const actor = await createActiveUser("resolved-assignment");
    const conversation = await prisma.conversation.create({ data: { status: ConversationStatus.RESOLVED, resolvedAt: new Date() } });
    conversationIds.push(conversation.id);

    await expect(service.assign(conversation.id, {
      assigneeUserId: actor.id,
      priority: ConversationPriority.NORMAL,
      expectedVersion: conversation.version,
      idempotencyKey: randomUUID(),
      reason: "Invalid direct assignment",
    }, { actorUserId: actor.id })).rejects.toThrow("INVALID_CONVERSATION_TRANSITION");
    expect(await prisma.conversationAssignment.count({ where: { conversationId: conversation.id } })).toBe(0);
  });

  it("distinguishes transfer and takeover and retains the same assignee without duplicate ownership", async () => {
    const [first, second] = await Promise.all([
      createActiveUser("handoff-first"),
      createActiveUser("handoff-second"),
    ]);
    const conversation = await prisma.conversation.create({ data: { status: ConversationStatus.HUMAN_REQUIRED } });
    conversationIds.push(conversation.id);

    await service.assign(conversation.id, {
      assigneeUserId: first.id,
      priority: ConversationPriority.NORMAL,
      expectedVersion: conversation.version,
      idempotencyKey: randomUUID(),
      reason: "Initial assignment",
    }, { actorUserId: first.id });
    const retainedState = await service.getRuntimeState(conversation.id);
    await service.assign(conversation.id, {
      assigneeUserId: first.id,
      priority: ConversationPriority.NORMAL,
      expectedVersion: retainedState.version,
      idempotencyKey: randomUUID(),
      reason: "Confirm current ownership",
    }, { actorUserId: first.id });
    expect((await service.getRuntimeState(conversation.id)).version).toBe(retainedState.version);

    const transferState = await service.getRuntimeState(conversation.id);
    await service.assign(conversation.id, {
      assigneeUserId: second.id,
      priority: ConversationPriority.HIGH,
      expectedVersion: transferState.version,
      idempotencyKey: randomUUID(),
      reason: "Transfer to specialist",
    }, { actorUserId: first.id });
    const takeoverState = await service.getRuntimeState(conversation.id);
    await service.assign(conversation.id, {
      assigneeUserId: first.id,
      priority: ConversationPriority.URGENT,
      expectedVersion: takeoverState.version,
      idempotencyKey: randomUUID(),
      reason: "Take back urgent case",
    }, { actorUserId: first.id });

    expect(await prisma.conversationAssignment.count({ where: { conversationId: conversation.id, releasedAt: null } })).toBe(1);
    const events = await prisma.conversationEvent.findMany({ where: { conversationId: conversation.id }, select: { eventType: true } });
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "ASSIGNMENT_CREATED",
      "ASSIGNMENT_RETAINED",
      "ASSIGNMENT_TRANSFERRED",
      "ASSIGNMENT_TAKEN_OVER",
    ]));
  });

  it("escalates, releases to the human queue and reopens only through audited transitions", async () => {
    const actor = await createActiveUser("lifecycle-actor");
    const conversation = await prisma.conversation.create({ data: { status: ConversationStatus.AI_ACTIVE } });
    conversationIds.push(conversation.id);

    const escalated = await service.escalate(conversation.id, {
      expectedVersion: conversation.version,
      idempotencyKey: randomUUID(),
      reasonCode: "POLICY_REVIEW_REQUIRED",
      reason: "Human policy review is required",
    }, { actorUserId: actor.id, correlationId: randomUUID() });
    expect(escalated.status).toBe(ConversationStatus.HUMAN_REQUIRED);

    const assigned = await service.assign(conversation.id, {
      assigneeUserId: actor.id,
      priority: ConversationPriority.HIGH,
      expectedVersion: escalated.version,
      idempotencyKey: randomUUID(),
      reason: "Take escalated case",
    }, { actorUserId: actor.id });
    const released = await service.release(conversation.id, {
      expectedVersion: assigned.version,
      idempotencyKey: randomUUID(),
      reason: "Return case to human queue",
    }, { actorUserId: actor.id });
    expect(released.status).toBe(ConversationStatus.HUMAN_REQUIRED);
    expect(await prisma.conversationAssignment.count({ where: { conversationId: conversation.id, releasedAt: null } })).toBe(0);

    const reassigned = await service.assign(conversation.id, {
      assigneeUserId: actor.id,
      priority: ConversationPriority.NORMAL,
      expectedVersion: released.version,
      idempotencyKey: randomUUID(),
      reason: "Retake queued case",
    }, { actorUserId: actor.id });
    const waiting = await service.transitionStatus(conversation.id, {
      targetStatus: ConversationStatus.WAITING_INTERNAL,
      expectedVersion: reassigned.version,
      idempotencyKey: randomUUID(),
      reason: "Await internal validation",
    }, { actorUserId: actor.id });
    const resolved = await service.transitionStatus(conversation.id, {
      targetStatus: ConversationStatus.RESOLVED,
      expectedVersion: waiting.version,
      idempotencyKey: randomUUID(),
      reason: "Internal validation completed",
    }, { actorUserId: actor.id });
    expect(resolved.status).toBe(ConversationStatus.RESOLVED);
    expect(await prisma.conversationAssignment.count({ where: { conversationId: conversation.id, releasedAt: null } })).toBe(0);
    const reopened = await service.transitionStatus(conversation.id, {
      targetStatus: ConversationStatus.AI_ACTIVE,
      expectedVersion: resolved.version,
      idempotencyKey: randomUUID(),
      reason: "User requested a new follow-up",
    }, { actorUserId: actor.id });
    expect(reopened.status).toBe(ConversationStatus.AI_ACTIVE);
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

  it("suppresses AI output whenever an active human assignment exists even if status is inconsistent", async () => {
    const actor = await createActiveUser("defense-in-depth-actor");
    const externalSessionId = randomUUID();
    const receipt = await service.receiveInbound(inbound(externalSessionId, randomUUID()));
    conversationIds.push(receipt.conversationId);
    await prisma.conversationAssignment.create({
      data: {
        conversationId: receipt.conversationId,
        assigneeUserId: actor.id,
        assignedByUserId: actor.id,
        priority: ConversationPriority.NORMAL,
      },
    });
    const state = await service.getRuntimeState(receipt.conversationId);
    expect(state).toMatchObject({ status: ConversationStatus.AI_ACTIVE, hasActiveAssignment: true, mayAutoReply: false });
    await expect(service.commitKoralOutbound({
      conversationId: receipt.conversationId,
      channel: ConversationChannel.WEB,
      externalSessionId,
      expectedVersion: state.version,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      contentType: "text/plain",
      body: "Must be suppressed",
    })).resolves.toMatchObject({ committed: false, reason: "CONVERSATION_NOT_AI_ACTIVE" });
  });

  it("makes a Web AI response locally available once and rejects idempotency-key reuse with different content", async () => {
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
    expect(await prisma.conversationMessage.findUniqueOrThrow({ where: { id: first.messageId } })).toMatchObject({ status: "SENT" });
    expect(await prisma.conversationEvent.count({ where: { conversationId: receipt.conversationId, eventType: "KORAL_RESPONSE_SENT" } })).toBe(1);
  });

  it("runs the governed public Web path through CAS persistence and sanitized audit", async () => {
    const externalSessionId = randomUUID();
    const receipt = await service.receiveInbound(inbound(externalSessionId, randomUUID(), "Hola"));
    conversationIds.push(receipt.conversationId);
    const gateway = {
      infer: jest.fn().mockResolvedValue({
        kind: "ASSISTANT_RESPONSE",
        content: "ignored provider prose",
        structuredOutput: { response: "¡Hola! ¿En qué puedo ayudarte?" },
        gatewayCorrelationId: "gateway-public-greeting",
      }),
    };
    const pipeline = new GovernedKoralOrchestrationPipeline(
      service,
      gateway as never,
      { search: jest.fn() } as never,
      { get: jest.fn().mockReturnValue(true) } as never,
    );
    const outcome = await pipeline.run({
      version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
      normalizedMessageId: receipt.messageId,
      correlationId: randomUUID(),
      deadlineAt: new Date(Date.now() + 20_000).toISOString(),
      effectiveIdentity: {
        version: IDENTITY_RESOLUTION_CONTRACT_VERSION,
        identityId: "anonymous:integration",
        channelIdentities: [{ channel: ConversationChannel.WEB, externalIdentityId: "visitor", verified: false }],
        assuranceLevel: "ANONYMOUS",
        authenticationEvidence: { authenticated: false, mfaVerified: false, stepUpVerified: false },
        consentState: { status: "UNKNOWN", purposeKeys: [] },
        verifiedAttributes: [],
      },
    });
    expect(outcome).toMatchObject({ kind: "RESPONDED", conversationId: receipt.conversationId });
    const outbound = await prisma.conversationMessage.findFirstOrThrow({
      where: { conversationId: receipt.conversationId, direction: "OUTBOUND" },
    });
    expect(outbound).toMatchObject({ status: "SENT", body: "¡Hola! ¿En qué puedo ayudarte?" });
    const audit = await prisma.conversationEvent.findFirstOrThrow({
      where: { conversationId: receipt.conversationId, eventType: "KORAL_RESPONSE_SENT" },
    });
    expect(audit.metadata).toMatchObject({ gatewayReferences: ["gateway-public-greeting"] });
    expect(JSON.stringify(audit.metadata)).not.toContain("ignored provider prose");
  });

  it("runs a public Web message through the real KnowledgeGateway before grounded inference", async () => {
    const actor = await createActiveUser("knowledge-publisher");
    const marker = `beneficio-koral-${randomUUID().replaceAll("-", "")}`;
    const knowledge = new KnowledgeService(
      prisma as never,
      [],
      DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
    );
    const draft = await knowledge.createManualDraft(
      {
        stableKey: marker,
        title: `Beneficios ASODEF ${marker}`,
        domain: "BENEFICIOS_Y_CONVENIOS",
        audience: "PUBLIC",
        classification: "PUBLIC",
        language: "es",
        sourceReference: `manual://${marker}`,
        sourceOwner: "Equipo ASODEF",
        changeReason: "Integración Koral Knowledge",
        content: `${marker} beneficios ASODEF publicados y verificables ${marker}`,
      },
      { actorUserId: actor.id, correlationId: `${knowledgeCorrelationPrefix}-create` },
    );
    knowledgeItemIds.push(draft.knowledgeItemId);
    const review = await knowledge.submitReview(
      draft.id,
      { expectedRevision: draft.revision, changeReason: "Revisión Koral" },
      { actorUserId: actor.id, correlationId: `${knowledgeCorrelationPrefix}-review` },
    );
    const approved = await knowledge.approve(
      draft.id,
      { expectedRevision: review.revision, changeReason: "Aprobación Koral" },
      { actorUserId: actor.id, correlationId: `${knowledgeCorrelationPrefix}-approve` },
    );
    await knowledge.publish(
      draft.id,
      { expectedRevision: approved.revision, changeReason: "Publicación Koral" },
      { actorUserId: actor.id, correlationId: `${knowledgeCorrelationPrefix}-publish` },
    );

    const externalSessionId = randomUUID();
    const question = `¿Cuáles son los beneficios de ASODEF ${marker}?`;
    const receipt = await service.receiveInbound(
      inbound(externalSessionId, randomUUID(), question),
    );
    conversationIds.push(receipt.conversationId);
    const aiGateway = {
      infer: jest.fn().mockResolvedValue({
        kind: "ASSISTANT_RESPONSE",
        content: "ignored provider prose",
        structuredOutput: { response: "Beneficio publicado y verificado." },
        gatewayCorrelationId: "ai-grounded-integration",
      }),
    };
    const pipeline = new GovernedKoralOrchestrationPipeline(
      service,
      aiGateway as never,
      new CanonicalKoralKnowledgeGatewayAdapter(knowledge),
      { get: jest.fn().mockReturnValue(true) } as never,
    );
    const correlationId = `${knowledgeCorrelationPrefix}-retrieval`;
    const outcome = await pipeline.run({
      version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
      normalizedMessageId: receipt.messageId,
      correlationId,
      deadlineAt: new Date(Date.now() + 20_000).toISOString(),
      effectiveIdentity: {
        version: IDENTITY_RESOLUTION_CONTRACT_VERSION,
        identityId: "anonymous:knowledge-integration",
        channelIdentities: [
          {
            channel: ConversationChannel.WEB,
            externalIdentityId: "visitor-knowledge",
            verified: false,
          },
        ],
        assuranceLevel: "ANONYMOUS",
        authenticationEvidence: {
          authenticated: false,
          mfaVerified: false,
          stepUpVerified: false,
        },
        consentState: { status: "UNKNOWN", purposeKeys: [] },
        verifiedAttributes: [],
      },
    });

    expect(outcome).toMatchObject({
      kind: "RESPONDED",
      conversationId: receipt.conversationId,
    });
    expect(aiGateway.infer).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining(marker) }),
        ]),
      }),
      expect.objectContaining({
        effectiveScope: expect.objectContaining({
          authority: "SERVER_SIDE",
          tenantKey: "ASODEF",
          audience: "PUBLIC",
        }),
      }),
    );
    await expect(
      prisma.knowledgeRetrievalAudit.findFirstOrThrow({
        where: { correlationId },
      }),
    ).resolves.toMatchObject({
      result: "SUFFICIENT_EVIDENCE",
      citationCount: 1,
    });
    await expect(service.findById(receipt.conversationId, actor.id)).resolves.toMatchObject({
      knowledgeRetrievals: [
        {
          result: "SUFFICIENT_EVIDENCE",
          citationCount: 1,
          correlationId,
        },
      ],
    });
    const event = await prisma.conversationEvent.findFirstOrThrow({
      where: {
        conversationId: receipt.conversationId,
        eventType: "KORAL_RESPONSE_SENT",
      },
    });
    expect(event.metadata).toMatchObject({
      gatewayReferences: [
        expect.stringMatching(
          /^knowledge-evidence:v1:[0-9a-f-]{36}:[0-9a-f-]{36}:ai:ai-grounded-integration$/u,
        ),
      ],
    });
    expect(event.correlationId).toBe(correlationId);
    const reference = (event.metadata as { gatewayReferences: string[] })
      .gatewayReferences[0]!;
    const [, , snapshotId, chunkId] = reference.split(":");
    await expect(
      prisma.knowledgePublicationSnapshot.findUniqueOrThrow({
        where: { id: snapshotId },
        include: {
          knowledgeItem: true,
          knowledgeVersion: true,
          source: true,
        },
      }),
    ).resolves.toMatchObject({
      knowledgeItemId: draft.knowledgeItemId,
      knowledgeVersionId: draft.id,
      source: { sourceReference: `manual://${marker}` },
    });
    await expect(
      prisma.knowledgeChunk.findFirstOrThrow({
        where: { id: chunkId, knowledgeVersionId: draft.id },
      }),
    ).resolves.toMatchObject({ content: expect.stringContaining(marker) });
    expect(JSON.stringify(event.metadata)).not.toContain(question);
  });

  it("linearizes a Koral handoff against concurrent human assignment and audits only the winner", async () => {
    const actor = await createActiveUser("koral-handoff-race");
    const externalSessionId = randomUUID();
    const receipt = await service.receiveInbound(inbound(externalSessionId, randomUUID()));
    conversationIds.push(receipt.conversationId);
    const state = await service.getRuntimeState(receipt.conversationId);
    const results = await Promise.allSettled([
      service.requestKoralHandoff({
        conversationId: receipt.conversationId,
        expectedVersion: state.version,
        sourceMessageId: receipt.messageId,
        correlationId: randomUUID(),
        reasonCodes: ["PROVIDER_UNAVAILABLE"],
      }),
      service.assign(receipt.conversationId, {
        assigneeUserId: actor.id,
        priority: ConversationPriority.HIGH,
        expectedVersion: state.version,
        idempotencyKey: randomUUID(),
        reason: "Concurrent human takeover",
      }, { actorUserId: actor.id }),
    ]);

    const handoff = results[0];
    const assignment = results[1];
    const handoffWon = handoff.status === "fulfilled" && handoff.value.transitioned;
    const assignmentWon = assignment.status === "fulfilled";
    expect(Number(handoffWon) + Number(assignmentWon)).toBe(1);
    const events = await prisma.conversationEvent.findMany({
      where: {
        conversationId: receipt.conversationId,
        eventType: { in: ["KORAL_HANDOFF_REQUIRED", "ASSIGNMENT_CREATED"] },
      },
      select: { eventType: true, metadata: true },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("contenido privado");
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
