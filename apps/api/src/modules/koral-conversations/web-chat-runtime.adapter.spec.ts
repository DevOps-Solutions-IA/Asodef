import { randomUUID } from "node:crypto";
import { ConversationChannel, ConversationStatus } from "@prisma/client";
import { KORAL_CHANNEL_CONTRACT_VERSION } from "./contracts/channel.contract";
import { KoralWebChatRuntimeAdapter } from "./web-chat-runtime.adapter";

describe("KoralWebChatRuntimeAdapter", () => {
  const conversations = {
    receiveInbound: jest.fn(),
    getRuntimeState: jest.fn(),
  };
  const identities = { resolveAnonymous: jest.fn(), resolveAuthenticated: jest.fn() };
  const bindings = { bind: jest.fn() };
  const rateLimiter = { checkAndIncrementStrict: jest.fn() };
  const orchestrator = { run: jest.fn() };
  const adapter = new KoralWebChatRuntimeAdapter(
    conversations as never,
    identities as never,
    bindings as never,
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

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter.checkAndIncrementStrict.mockResolvedValue({ limited: false });
    conversations.receiveInbound.mockResolvedValue({ conversationId: "conversation-1", messageId: "message-db-1", duplicate: false });
    conversations.getRuntimeState.mockResolvedValue({ status: ConversationStatus.AI_ACTIVE, version: 2, mayAutoReply: true });
    identities.resolveAnonymous.mockReturnValue(anonymous);
    bindings.bind.mockResolvedValue({ replayed: false });
    orchestrator.run.mockResolvedValue({ kind: "WAITING", conversationId: "conversation-1", completedSteps: [], reasonCodes: [] });
  });

  it("normalizes the runtime flow, binds anonymous identity and invokes orchestration with a bounded deadline", async () => {
    const result = await adapter.receive({ message, deadlineAt: "2026-08-22T12:00:20.000Z" }, now);
    expect(result.kind).toBe("ORCHESTRATED");
    expect(identities.resolveAnonymous).toHaveBeenCalled();
    expect(bindings.bind).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conversation-1", identity: anonymous.identity }));
    expect(orchestrator.run).toHaveBeenCalledWith(expect.objectContaining({ normalizedMessageId: "message-db-1", deadlineAt: "2026-08-22T12:00:20.000Z" }));
  });

  it("never starts orchestration while a human owns the conversation", async () => {
    conversations.getRuntimeState.mockResolvedValue({ status: ConversationStatus.HUMAN_ACTIVE, version: 3, mayAutoReply: false });
    await expect(adapter.receive({ message: { ...message, externalMessageId: randomUUID() }, deadlineAt: "2026-08-22T12:00:20.000Z" }, now))
      .resolves.toMatchObject({ kind: "HUMAN_ACTIVE" });
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it("fails closed when strict rate limiting is unavailable/limited or the deadline is unsafe", async () => {
    rateLimiter.checkAndIncrementStrict.mockResolvedValueOnce({ limited: true });
    await expect(adapter.receive({ message, deadlineAt: "2026-08-22T12:00:20.000Z" }, now)).rejects.toMatchObject({ status: 429 });
    await expect(adapter.receive({ message, deadlineAt: "2026-08-22T12:01:00.000Z" }, now)).rejects.toThrow("INVALID_ORCHESTRATION_DEADLINE");
  });

  it("uses server authentication evidence instead of channel claims", async () => {
    identities.resolveAuthenticated.mockResolvedValue({ ...anonymous, identity: { identityId: "portal-user:user-1", assuranceLevel: "AUTHENTICATED" } });
    await adapter.receive({
      message,
      principal: { userId: "user-1", sessionId: "session-1" },
      deadlineAt: "2026-08-22T12:00:20.000Z",
    }, now);
    expect(identities.resolveAuthenticated).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", sessionId: "session-1" }), now);
    expect(identities.resolveAnonymous).not.toHaveBeenCalled();
  });
});
