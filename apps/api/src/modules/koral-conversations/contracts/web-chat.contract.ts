import type { ConversationIdentityAssurance, ConversationMessageDirection, ConversationMessageStatus, ConversationStatus } from "@prisma/client";

export const WEB_CHAT_CONTRACT_VERSION = "1.0.0" as const;
export const WEB_CHAT_SESSION_COOKIE = "__Host-asodef_koral_web" as const;

export interface PublicWebChatMessage {
  id: string;
  clientMessageId?: string;
  direction: Extract<ConversationMessageDirection, "INBOUND" | "OUTBOUND">;
  author: "VISITOR" | "KORAL" | "HUMAN" | "SYSTEM";
  content: { type: "text/plain"; body: string };
  status: ConversationMessageStatus;
  occurredAt: string;
}

export interface PublicWebChatSnapshot {
  version: typeof WEB_CHAT_CONTRACT_VERSION;
  conversation: {
    status: ConversationStatus;
    aiAutoReplyAllowed: boolean;
    assuranceLevel: ConversationIdentityAssurance;
    updatedAt: string;
  };
  messages: PublicWebChatMessage[];
  nextCursor?: string;
  pollAfterMs?: number;
}

export const WEB_CHAT_CONTRACT_SEMANTICS = {
  version: WEB_CHAT_CONTRACT_VERSION,
  inputSchema: {
    bootstrap: "BootstrapWebChatDto",
    history: "WebChatHistoryQueryDto",
    messages: "SendWebChatMessageDto",
    identityClaim: "ClaimWebChatIdentityDto",
  },
  outputSchema: "PublicWebChatSnapshot",
  permissions: "Public browser access is limited to the exact server session proven by the host-only cookie; no admin or cross-session capability is inferred.",
  authorization: "Only the Secure HttpOnly host-only cookie is a browser capability; internal conversation identifiers are not projected.",
  idempotency: "clientMessageId is unique inside the server-owned channel session; reuse with payload drift is rejected.",
  audit: "Session and identity events contain identifiers and reason codes only; cookie values and message bodies are excluded.",
  errors: [
    "WEB_CHAT_SESSION_UNAVAILABLE",
    "INVALID_WEB_CHAT_CURSOR",
    "WEB_CHAT_ORIGIN_REJECTED",
    "WEB_CHAT_ORIGIN_REQUIRED",
    "WEB_CHAT_JSON_REQUIRED",
    "WEB_CHAT_MESSAGE_DRIFT",
    "WEB_CHAT_DUPLICATE_STATE_INVALID",
    "INVALID_WEB_CHAT_MESSAGE",
    "INVALID_WEB_CHAT_DISPLAY_NAME",
    "WEB_CHAT_IDENTITY_ALREADY_CLAIMED",
    "WEB_CHAT_ASSURANCE_UPGRADE_NOT_ALLOWED",
    "RATE_LIMITED",
    "WEB_CHAT_SECURITY_DEPENDENCY_UNAVAILABLE",
  ],
} as const;
