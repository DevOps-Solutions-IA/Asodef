import { WebChatSessionService } from "./web-chat-session.service";

describe("WebChatSessionService", () => {
  it("propagates database failures during capability rotation instead of silently creating a session", async () => {
    const prisma = { $transaction: jest.fn().mockRejectedValue(new Error("database unavailable")) };
    const crypto = {
      tokenDigest: jest.fn().mockReturnValue("a".repeat(64)),
      issueToken: jest.fn().mockReturnValue("b".repeat(43)),
    };
    const service = new WebChatSessionService(prisma as never, crypto as never);

    await expect(service.bootstrap("c".repeat(43), "correlation-1", async () => undefined)).rejects.toThrow("database unavailable");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
