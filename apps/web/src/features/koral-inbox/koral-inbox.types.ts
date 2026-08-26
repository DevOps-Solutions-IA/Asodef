export type ConversationStatus = "AI_ACTIVE" | "WAITING_USER" | "HUMAN_REQUIRED" | "HUMAN_ACTIVE" | "WAITING_INTERNAL" | "RESOLVED" | "CLOSED";
export type ConversationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ConversationChannel = "WEB" | "WHATSAPP" | "INSTAGRAM" | "MESSENGER" | "FUTURE";
export type ConversationSlaState = "NONE" | "ON_TRACK" | "DUE_SOON" | "OVERDUE";
export type ConversationQueueView = "ALL" | "MINE" | "UNASSIGNED" | "HUMAN_REQUIRED";

export interface InboxAssignee { id: string; displayName: string }

export interface InboxConversationSummary {
  id: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  version: number;
  subject: string | null;
  lastMessageAt: string | null;
  slaDueAt: string | null;
  slaState: ConversationSlaState;
  queue: ConversationQueueView;
  activeAssignee: InboxAssignee | null;
  channels: ConversationChannel[];
  tags: string[];
  unread: boolean;
  updatedAt: string;
}

export interface InboxConversationDetail extends InboxConversationSummary {
  participants: Array<{ id: string; kind: string; channel: ConversationChannel | null; displayName: string | null; userId: string | null; createdAt: string }>;
  messages: Array<{ id: string; direction: "INBOUND" | "OUTBOUND" | "INTERNAL"; status: string; contentType: string; body: string | null; correlationId: string | null; occurredAt: string; createdAt: string; attachments: Array<{ id: string; mediaType: string; fileName: string | null; byteSize: number | null }> }>;
  assignments: Array<{ id: string; assignee: InboxAssignee; assignedBy: InboxAssignee; priority: ConversationPriority; reason: string | null; assignedAt: string; releasedAt: string | null }>;
  internalNotes: Array<{ id: string; body: string; createdAt: string; author: InboxAssignee }>;
  events: Array<{ id: string; eventType: string; actorUserId: string | null; requestId: string | null; correlationId: string | null; previousStatus: string | null; newStatus: string | null; result: string; reason: string | null; createdAt: string }>;
  identityTimeline: Array<{ id: string; previousAssurance: string | null; newAssurance: string; reason: string; correlationId: string; createdAt: string }>;
  knowledgeRetrievals: Array<{ id: string; result: string; reasonCode: string | null; correlationId: string; citationCount: number; createdAt: string }>;
  channelSessions: Array<{ id: string; channel: ConversationChannel; adapterVersion: string; openedAt: string; lastSeenAt: string; closedAt: string | null }>;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface InboxFilters {
  status?: ConversationStatus;
  priority?: ConversationPriority;
  assigneeUserId?: string;
  channel?: ConversationChannel;
  slaState?: ConversationSlaState;
  queue?: ConversationQueueView;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InboxListResponse { items: InboxConversationSummary[]; total: number; page: number; pageSize: number }
export interface InboxMutationInput { expectedVersion: number; idempotencyKey: string; reason: string }
