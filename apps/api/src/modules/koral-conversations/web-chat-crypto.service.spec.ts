import { BadRequestException } from "@nestjs/common";
import { WebChatCryptoService } from "./web-chat-crypto.service";

describe("WebChatCryptoService", () => {
  const config = { get: jest.fn().mockReturnValue("test-encryption-key-at-least-32-bytes-long") };
  const crypto = new WebChatCryptoService(config as never);

  it("issues a 256-bit opaque token and persists only a deterministic digest", () => {
    const token = crypto.issueToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(crypto.tokenDigest(token)).toMatch(/^[a-f0-9]{64}$/u);
    expect(crypto.tokenDigest(token)).not.toContain(token);
  });

  it("binds signed cursors to the exact server session and rejects tampering", () => {
    const issuedAt = new Date("2026-08-24T12:00:00.000Z");
    const cursor = crypto.encodeCursor({
      sessionId: "6af1f79b-2a26-4bca-8d15-e0d74c9772e0",
      occurredAt: "2026-08-24T12:00:00.000Z",
      messageId: "2b3f79bd-448a-46a2-8f98-879f10a581ad",
    }, issuedAt);
    expect(cursor).not.toContain("6af1f79b");
    expect(Buffer.from(cursor.split(".")[1]!, "base64url").toString("utf8")).not.toContain("sessionId");
    expect(crypto.decodeCursor(cursor, "6af1f79b-2a26-4bca-8d15-e0d74c9772e0", new Date("2026-08-24T12:14:59.000Z"))).toMatchObject({ v: 1 });
    expect(() => crypto.decodeCursor(cursor, "1e766d89-e86b-4c45-9f28-6bd49b2eb202", issuedAt)).toThrow(BadRequestException);
    expect(() => crypto.decodeCursor(`${cursor}x`, "6af1f79b-2a26-4bca-8d15-e0d74c9772e0", issuedAt)).toThrow(BadRequestException);
    expect(() => crypto.decodeCursor(cursor, "6af1f79b-2a26-4bca-8d15-e0d74c9772e0", new Date("2026-08-24T12:15:00.000Z"))).toThrow(BadRequestException);
  });

  it("projects a stable opaque UUID-shaped message reference", () => {
    const publicId = crypto.publicMessageId("session-a", "internal-message-a");
    expect(publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(publicId).toBe(crypto.publicMessageId("session-a", "internal-message-a"));
    expect(publicId).not.toBe(crypto.publicMessageId("session-b", "internal-message-a"));
  });
});
