import { randomUUID } from "node:crypto";
import { ConversationChannel, ConversationStatus } from "@prisma/client";
import { KORAL_CHANNEL_CONTRACT_VERSION } from "./contracts/channel.contract";
import { RateLimitDependencyUnavailableError } from "../auth/rate-limiter.service";
import { KoralWebChatRuntimeAdapter } from "./web-chat-runtime.adapter";

describe("KoralWebChatRuntimeAdapter", () => {
  const conversations = {
    receiveWebChatInbound: jest.fn(),
    getRuntimeState: jest.fn(),
  };
  const identities = { resolveAnonymous: jest.fn(), resolveAuthenticated: jest.fn() };
  const bindings = { bindInTransaction: jest.fn() };
  const processing = { claim: jest.fn(), complete: jest.fn(), suppress: jest.fn(), markUnknown: jest.fn() };
  const rateLimiter = { checkAndIncrementStrict: jest.fn() };
  const orchestrator = { available: true, run: jest.fn() };
  const adapter = new KoralWebChatRuntimeAdapter(
    conversations as never,
    identities as never,
    bindings as never,
    processing as never,
    rateLimiter as never,
    orchestrator as never,
  );
  const now = new Date("2026-08-22T12:00:00.000Z");
  const message = {
    version: KORAL_CHANNEL_CONTRACT_VERSION,
    channel: ConversationChannel.WEB,
    adapterVersion: "web-v1",
    externalSessionId: "browser-session-1",
    externalMessageId: "message-1",
    identity: { channel: ConversationChannel.WEB, externalIdentityId: "visitor-1" },
    occurredAt: now,
    contentType: "text/plain",
    body: "Hola",
    attachments: [],
  };
  const anonymous = {
    identity: { identityId: "anonymous:hash", assuranceLevel: "ANONYMOUS" },
    reason: "CHANNEL_ANONYMOUS",
    evidenceReference: "channel:hash",
  };
  const fence = { sessionId: randomUUID(), generation: 1, channelSessionId: randomUUID() };
  const runtimeInput = (overrides: Record<string, unknown> = {}) => ({
    sessionFence: fence,
    payloadHash: "a".repeat(64),
    message,
    deadlineAt: "2026-08-22T12:00:20.000Z",
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter.checkAndIncrementStrict.mockResolvedValue({ limited: false });
    conversations.receiveWebChatInbound.mockImplementation(async (_message: unknown, _fence: unknown, _hash: unknown, bind: (tx: unknown, id: string) => Promise<void>) => {
      await bind({}, "conversation-1");
      return { conversationId: "conversation-1", messageId: "message-db-1", duplicate: false, processingStatus: "PENDING" };
    });
    conversations.getRuntimeState.mockResolvedValue({ status: ConversationStatus.AI_ACTIVE, version: 2, mayAutoReply: true });
    identities.resolveAnonymous.mockReturnValue(anonymous);
    bindings.bindInTransaction.mockResolvedValue({ replayed: false });
    processing.claim.mockResolvedValue({ kind: "CLAIMED", leaseId: randomUUID() });
    processing.complete.mockResolvedValue(undefined);
    processing.suppress.mockResolvedValue(undefined);
    processing.markUnknown.mockResolvedValue(undefined);
    orchestrator.run.mockResolvedValue({ kind: "WAITING", conversationId: "conversation-1", completedSteps: [], reasonCodes: [] });
  });

  it("normalizes the runtime flow, binds anonymous identity and invokes orchestration with a bounded deadline", async () => {
    const result = await adapter.receive(runtimeInput(), now);
    expect(result.kind).toBe("ORCHESTRATED");
    expect(identities.resolveAnonymous).toHaveBeenCalled();
    expect(bindings.bindInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId: "conversation-1", identity: anonymous.identity }), true);
    expect(orchestrator.run).toHaveBeenCalledWith(expect.objectContaining({
      normalizedMessageId: "message-db-1",
      deadlineAt: "2026-08-22T12:00:20.000Z",
      effectiveIdentity: anonymous.identity,
    }));
  });

  it("never starts orchestration while a human owns the conversation", async () => {
    conversations.getRuntimeState.mockResolvedValue({ status: ConversationStatus.HUMAN_ACTIVE, version: 3, hasActiveAssignment: true, mayAutoReply: false });
    await expect(adapter.receive(runtimeInput({ message: { ...message, externalMessageId: randomUUID() } }), now))
      .resolves.toMatchObject({ kind: "SUPPRESSED", reason: "ACTIVE_ASSIGNMENT", status: ConversationStatus.HUMAN_ACTIVE });
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it("suppresses HUMAN_REQUIRED and stale AI_ACTIVE with an active assignment", async () => {
    conversations.getRuntimeState.mockResolvedValueOnce({ status: ConversationStatus.HUMAN_REQUIRED, version: 3, hasActiveAssignment: false, mayAutoReply: false });
    await expect(adapter.receive(runtimeInput({ message: { ...message, externalMessageId: randomUUID() } }), now))
      .resolves.toMatchObject({ kind: "SUPPRESSED", reason: "HUMAN_HANDOFF" });
    conversations.getRuntimeState.mockResolvedValueOnce({ status: ConversationStatus.AI_ACTIVE, version: 4, hasActiveAssignment: true, mayAutoReply: false });
    await expect(adapter.receive(runtimeInput({ message: { ...message, externalMessageId: randomUUID() } }), now))
      .resolves.toMatchObject({ kind: "SUPPRESSED", reason: "ACTIVE_ASSIGNMENT" });
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it("completes identity binding before acknowledging an inbound replay", async () => {
    conversations.receiveWebChatInbound.mockImplementationOnce(async (_message: unknown, _fence: unknown, _hash: unknown, bind: (tx: unknown, id: string) => Promise<void>) => {
      await bind({}, "conversation-1");
      return { conversationId: "conversation-1", messageId: "message-db-1", duplicate: true, processingStatus: "COMPLETED" };
    });
    await expect(adapter.receive(runtimeInput(), now)).resolves.toMatchObject({ kind: "DUPLICATE" });
    expect(bindings.bindInTransaction).toHaveBeenCalledTimes(1);
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it("persists safely but reports runtime suppression when no canonical orchestration pipeline is registered", async () => {
    const withoutPipeline = new KoralWebChatRuntimeAdapter(
      conversations as never,
      identities as never,
      bindings as never,
      processing as never,
      rateLimiter as never,
    );
    await expect(withoutPipeline.receive(runtimeInput(), now))
      .resolves.toMatchObject({ kind: "SUPPRESSED", reason: "RUNTIME_UNAVAILABLE" });
  });

  it("fails closed when strict rate limiting is unavailable/limited or the deadline is unsafe", async () => {
    rateLimiter.checkAndIncrementStrict.mockResolvedValueOnce({ limited: true });
    await expect(adapter.receive(runtimeInput(), now)).rejects.toMatchObject({ status: 429 });
    await expect(adapter.receive(runtimeInput({ deadlineAt: "2026-08-22T12:01:00.000Z" }), now)).rejects.toThrow("INVALID_ORCHESTRATION_DEADLINE");
    rateLimiter.checkAndIncrementStrict.mockRejectedValueOnce(new RateLimitDependencyUnavailableError());
    await expect(adapter.receive(runtimeInput(), now)).rejects.toMatchObject({ status: 503 });
  });

  it("uses server authentication evidence instead of channel claims", async () => {
    identities.resolveAuthenticated.mockResolvedValue({ ...anonymous, identity: { identityId: "portal-user:user-1", assuranceLevel: "AUTHENTICATED" } });
    await adapter.receive(runtimeInput({
      principal: { userId: "user-1", sessionId: "session-1" },
    }), now);
    expect(identities.resolveAuthenticated).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", sessionId: "session-1" }), now);
    expect(identities.resolveAnonymous).not.toHaveBeenCalled();
  });

  it("fails closed before message persistence when authenticated session evidence is invalid", async () => {
    identities.resolveAuthenticated.mockRejectedValueOnce(new Error("AUTHENTICATION_EVIDENCE_INVALID"));
    await expect(adapter.receive(runtimeInput({
      principal: { userId: "user-1", sessionId: "revoked-session" },
    }), now)).rejects.toThrow("AUTHENTICATION_EVIDENCE_INVALID");
    expect(conversations.receiveWebChatInbound).not.toHaveBeenCalled();
    expect(bindings.bindInTransaction).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });
});
