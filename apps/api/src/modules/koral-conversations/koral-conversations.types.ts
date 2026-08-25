import type { ConversationChannel, ConversationPriority, ConversationStatus, WebChatProcessingStatus } from "@prisma/client";

export enum ConversationQueueView {
  ALL = "ALL",
  MINE = "MINE",
  UNASSIGNED = "UNASSIGNED",
  HUMAN_REQUIRED = "HUMAN_REQUIRED",
}

export enum ConversationSlaState {
  NONE = "NONE",
  ON_TRACK = "ON_TRACK",
  DUE_SOON = "DUE_SOON",
  OVERDUE = "OVERDUE",
}

export interface ConversationAssigneeResponse {
  id: string;
  displayName: string;
}

export interface ConversationSummaryResponse {
  id: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  version: number;
  subject: string | null;
  lastMessageAt: Date | null;
  slaDueAt: Date | null;
  slaState: ConversationSlaState;
  queue: ConversationQueueView;
  activeAssignee: ConversationAssigneeResponse | null;
  channels: ConversationChannel[];
  tags: string[];
  unread: boolean;
  updatedAt: Date;
}

export interface InboundReceipt {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
  shouldAutoReply: boolean;
  status: ConversationStatus;
  processingStatus?: WebChatProcessingStatus;
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
  gatewayReferences?: readonly string[];
}

export interface KoralContextSnapshot {
  conversationId: string;
  conversationVersion: number;
  status: ConversationStatus;
  sourceMessageId: string;
  channel: ConversationChannel;
  externalSessionId: string;
  participantSummary: Array<{ kind: string; channel?: string }>;
  recentMessages: Array<{
    id: string;
    direction: string;
    contentType: string;
    body?: string;
    occurredAt: Date;
  }>;
  tags: string[];
  activeAssignmentUserId?: string;
}

export interface KoralHandoffInput {
  conversationId: string;
  expectedVersion: number;
  sourceMessageId: string;
  correlationId: string;
  reasonCodes: readonly string[];
  gatewayReferences?: readonly string[];
}
