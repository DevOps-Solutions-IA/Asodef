import type { ConversationChannel, ConversationPriority, ConversationStatus } from "@prisma/client";

export interface ConversationSummaryResponse {
  id: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  version: number;
  subject: string | null;
  lastMessageAt: Date | null;
  slaDueAt: Date | null;
  activeAssigneeUserId: string | null;
  channels: ConversationChannel[];
  updatedAt: Date;
}

export interface InboundReceipt {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
  shouldAutoReply: boolean;
  status: ConversationStatus;
}

export interface MutationContext {
  actorUserId: string;
  requestId?: string;
  correlationId?: string;
}

export interface ConversationRuntimeState {
  id: string;
  status: ConversationStatus;
  version: number;
  hasActiveAssignment: boolean;
  mayAutoReply: boolean;
}

export interface KoralOutboundCommitInput {
  conversationId: string;
  channel: ConversationChannel;
  externalSessionId: string;
  expectedVersion: number;
  idempotencyKey: string;
  correlationId: string;
  contentType: string;
  body: string;
}
