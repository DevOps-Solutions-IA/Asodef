import { beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../api-client", () => ({ apiClient: apiClientMock }));

import { koralWebChatClient } from "./koral-web-chat-api";
import { WEB_CHAT_CONTRACT_VERSION } from "./types";

const snapshot = {
  version: WEB_CHAT_CONTRACT_VERSION,
  conversation: {
    status: "AI_ACTIVE",
    aiAutoReplyAllowed: true,
    assuranceLevel: "ANONYMOUS",
    updatedAt: "2026-08-23T12:00:00.000Z",
  },
  messages: [],
};

describe("koralWebChatClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.get.mockResolvedValue(snapshot);
    apiClientMock.post.mockResolvedValue(snapshot);
  });

  it("uses only the HttpOnly-cookie endpoints and never sends a conversation or external session bearer", async () => {
    await koralWebChatClient.bootstrap();
    await koralWebChatClient.history(undefined, "cursor-value");
    await koralWebChatClient.sendMessage({
      clientMessageId: "35d4c23d-03a9-42ef-8280-e189ebe84de6",
      body: "Hola",
    });
    await koralWebChatClient.claimIdentity({
      clientClaimId: "6e63efc2-57da-48e4-bf99-c19ee452884c",
      displayName: "  Visitante ASODEF  ",
    });

    expect(apiClientMock.post).toHaveBeenNthCalledWith(1, "/koral/web-chat/bootstrap", { version: "1.0.0" }, expect.objectContaining({ skipAuthRefresh: true }));
    expect(apiClientMock.get).toHaveBeenCalledWith("/koral/web-chat/history?cursor=cursor-value", expect.objectContaining({ skipAuthRefresh: true }));
    expect(apiClientMock.post).toHaveBeenNthCalledWith(2, "/koral/web-chat/messages", {
      version: "1.0.0",
      clientMessageId: "35d4c23d-03a9-42ef-8280-e189ebe84de6",
      content: { type: "text/plain", body: "Hola" },
    }, expect.objectContaining({ skipAuthRefresh: true }));
    expect(apiClientMock.post).toHaveBeenNthCalledWith(3, "/koral/web-chat/identity/claim", {
      version: "1.0.0",
      clientClaimId: "6e63efc2-57da-48e4-bf99-c19ee452884c",
      displayName: "Visitante ASODEF",
    }, expect.objectContaining({ skipAuthRefresh: true }));
    expect(JSON.stringify(apiClientMock.post.mock.calls)).not.toMatch(/conversationId|externalSessionId|sessionToken/u);
  });

  it("fails closed when a response adds a session capability or contradicts human handoff", async () => {
    apiClientMock.post.mockResolvedValueOnce({ ...snapshot, sessionToken: "must-not-cross-client" });
    await expect(koralWebChatClient.bootstrap()).rejects.toThrow();

    apiClientMock.post.mockResolvedValueOnce({
      ...snapshot,
      conversation: { ...snapshot.conversation, status: "HUMAN_ACTIVE", aiAutoReplyAllowed: true },
    });
    await expect(koralWebChatClient.bootstrap()).rejects.toThrow("Human handoff cannot permit AI auto-response");
  });

  it("accepts the canonical opaque snapshot without requiring a conversation identifier", async () => {
    await expect(koralWebChatClient.bootstrap()).resolves.toEqual(snapshot);
    expect(snapshot.conversation).not.toHaveProperty("id");

    apiClientMock.post.mockResolvedValueOnce({
      ...snapshot,
      conversation: { ...snapshot.conversation, id: "28dce9a7-2822-4ac1-9eb2-b52f714699f3" },
    });
    await expect(koralWebChatClient.bootstrap()).rejects.toThrow();
  });

  it("rejects invalid message identifiers before a network call", async () => {
    await expect(koralWebChatClient.sendMessage({ clientMessageId: "not-a-uuid", body: "Hola" })).rejects.toThrow();
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });

  it("rejects malformed claims before a network call", async () => {
    await expect(koralWebChatClient.claimIdentity({ clientClaimId: "not-a-uuid", displayName: "Visitante" })).rejects.toThrow();
    await expect(koralWebChatClient.claimIdentity({
      clientClaimId: "6e63efc2-57da-48e4-bf99-c19ee452884c",
      displayName: " ",
    })).rejects.toThrow();
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });
});
