import { z } from "zod";

export const WEB_CHAT_CONTRACT_VERSION = "1.0.0" as const;

export const webChatConversationStatuses = [
  "AI_ACTIVE",
  "WAITING_USER",
  "HUMAN_REQUIRED",
  "HUMAN_ACTIVE",
  "WAITING_INTERNAL",
  "RESOLVED",
  "CLOSED",
] as const;

export type WebChatConversationStatus = (typeof webChatConversationStatuses)[number];

export const webChatAssuranceLevels = [
  "ANONYMOUS",
  "CLAIMED",
  "MATCHED",
  "VERIFIED",
  "AUTHENTICATED",
  "MFA_VERIFIED",
  "STEP_UP_VERIFIED",
] as const;

export type WebChatAssuranceLevel = (typeof webChatAssuranceLevels)[number];
export type WebChatMessageAuthor = "VISITOR" | "KORAL" | "HUMAN" | "SYSTEM";
export type WebChatMessageStatus = "PENDING" | "RECEIVED" | "SENT" | "DELIVERED" | "FAILED";

const messageContentSchema = z.object({
  type: z.literal("text/plain"),
  body: z.string().min(1).max(4_000),
}).strict();

const webChatMessageSchema = z.object({
  id: z.string().uuid(),
  clientMessageId: z.string().uuid().optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  author: z.enum(["VISITOR", "KORAL", "HUMAN", "SYSTEM"]),
  content: messageContentSchema,
  status: z.enum(["PENDING", "RECEIVED", "SENT", "DELIVERED", "FAILED"]),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

const webChatConversationSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(webChatConversationStatuses),
  /** Server-authoritative projection. The client never derives this from
   * status because an active assignment also disables AI auto-response. */
  aiAutoReplyAllowed: z.boolean(),
  assuranceLevel: z.enum(webChatAssuranceLevels),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((conversation, context) => {
  if (
    (conversation.status === "HUMAN_REQUIRED" || conversation.status === "HUMAN_ACTIVE")
    && conversation.aiAutoReplyAllowed
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aiAutoReplyAllowed"],
      message: "Human handoff cannot permit AI auto-response.",
    });
  }
});

export const webChatSnapshotSchema = z.object({
  version: z.literal(WEB_CHAT_CONTRACT_VERSION),
  conversation: webChatConversationSchema,
  messages: z.array(webChatMessageSchema).max(200),
  nextCursor: z.string().min(1).max(512).optional(),
  pollAfterMs: z.number().int().min(1_000).max(30_000).optional(),
}).strict();

export type WebChatMessage = z.infer<typeof webChatMessageSchema>;
export type WebChatSnapshot = z.infer<typeof webChatSnapshotSchema>;

export interface SendWebChatMessageInput {
  clientMessageId: string;
  body: string;
}

export interface LocalWebChatMessage {
  clientMessageId: string;
  body: string;
  state: "PENDING" | "RETRYABLE";
}

export const WEB_CHAT_CONTRACT_SEMANTICS = {
  version: WEB_CHAT_CONTRACT_VERSION,
  session: "HttpOnly cookie owned by the server; no session capability is exposed to JavaScript storage.",
  authorization: "conversationId and externalSessionId are never accepted as session proof.",
  idempotency: "clientMessageId remains stable across an explicit retry.",
  streaming: "No streaming or typing event is represented until the backend contract publishes one.",
} as const;
