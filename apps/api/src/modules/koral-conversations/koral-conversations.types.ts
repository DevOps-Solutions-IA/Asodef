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
