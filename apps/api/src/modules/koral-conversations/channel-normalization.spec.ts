import { ConversationChannel } from "@prisma/client";
import { normalizeInboundMessage } from "./channel-normalization";
import { KORAL_CHANNEL_CONTRACT_VERSION, type InboundMessage } from "./contracts/channel.contract";

function validInput(): InboundMessage {
  return {
    version: KORAL_CHANNEL_CONTRACT_VERSION,
    channel: ConversationChannel.WEB,
    adapterVersion: " web-v1 ",
    externalSessionId: " session-1 ",
    externalMessageId: " message-1 ",
    identity: { channel: ConversationChannel.WHATSAPP, externalIdentityId: " visitor-1 ", displayName: " Persona " },
    occurredAt: new Date("2026-08-22T12:00:00Z"),
    contentType: " Text/Plain ",
    body: "Hola",
    attachments: [{ mediaType: " Image/PNG ", byteSize: 10, checksumSha256: "a".repeat(64) }],
  };
}

describe("channel normalization", () => {
  it("normalizes identifiers and binds identity to the adapter channel", () => {
    const normalized = normalizeInboundMessage(validInput());
    expect(normalized.externalSessionId).toBe("session-1");
    expect(normalized.identity).toEqual({ channel: ConversationChannel.WEB, externalIdentityId: "visitor-1", displayName: "Persona" });
    expect(normalized.contentType).toBe("text/plain");
    expect(normalized.attachments[0]?.mediaType).toBe("image/png");
  });

  it("rejects invalid contract versions, control characters and attachment checksums", () => {
    expect(() => normalizeInboundMessage({ ...validInput(), version: "0.9.0" as "1.0.0" })).toThrow("versión");
    expect(() => normalizeInboundMessage({ ...validInput(), externalMessageId: "bad\nvalue" })).toThrow("externalMessageId");
    expect(() => normalizeInboundMessage({ ...validInput(), attachments: [{ mediaType: "image/png", checksumSha256: "secret" }] })).toThrow("checksum");
  });
});
