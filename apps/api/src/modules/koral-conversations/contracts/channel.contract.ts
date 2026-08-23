import type { ConversationChannel } from "@prisma/client";

export const KORAL_CHANNEL_CONTRACT_VERSION = "1.0.0" as const;

export interface ChannelIdentity {
  channel: ConversationChannel;
  externalIdentityId: string;
  displayName?: string;
}

export interface AttachmentMetadata {
  mediaType: string;
  fileName?: string;
  byteSize?: number;
  checksumSha256?: string;
  storageKey?: string;
  externalReference?: string;
}

export interface InboundMessage {
  version: typeof KORAL_CHANNEL_CONTRACT_VERSION;
  channel: ConversationChannel;
  adapterVersion: string;
  externalSessionId: string;
  externalMessageId: string;
  identity: ChannelIdentity;
  occurredAt: Date;
  contentType: string;
  body?: string;
  attachments: AttachmentMetadata[];
  correlationId?: string;
  channelMetadata?: Record<string, string | number | boolean | null>;
}

export interface OutboundMessage {
  version: typeof KORAL_CHANNEL_CONTRACT_VERSION;
  conversationId: string;
  channel: ConversationChannel;
  externalSessionId: string;
  idempotencyKey: string;
  contentType: string;
  body?: string;
  attachments: AttachmentMetadata[];
  correlationId?: string;
}

export type ChannelDeliveryErrorCode =
  | "CHANNEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "RECIPIENT_UNAVAILABLE"
  | "PAYLOAD_REJECTED"
  | "UNKNOWN_RESULT";

export type ChannelDeliveryResult =
  | { ok: true; externalMessageId: string; acceptedAt: Date }
  | { ok: false; code: ChannelDeliveryErrorCode; retryable: boolean; safeMessage: string };

/**
 * Adapters normalize transport payloads and perform delivery only. They never
 * receive Prisma/SQL/Redis clients or business-service instances.
 */
export interface ChannelAdapter {
  readonly channel: ConversationChannel;
  readonly contractVersion: typeof KORAL_CHANNEL_CONTRACT_VERSION;
  normalizeInbound(payload: unknown): Promise<InboundMessage>;
  deliver(message: OutboundMessage): Promise<ChannelDeliveryResult>;
}

export const CHANNEL_CONTRACT_SEMANTICS = {
  version: KORAL_CHANNEL_CONTRACT_VERSION,
  permissions: "Adapter credentials are scoped to one channel; admin HTTP permissions do not cross this boundary.",
  audit: "Accepted inbound and outbound delivery results create ConversationEvent rows without message body or credentials.",
  idempotency: "Inbound is unique by channel session plus externalMessageId; outbound requires an adapter-stable idempotencyKey.",
  errors: ["CHANNEL_UNAVAILABLE", "RATE_LIMITED", "RECIPIENT_UNAVAILABLE", "PAYLOAD_REJECTED", "UNKNOWN_RESULT"],
} as const;
