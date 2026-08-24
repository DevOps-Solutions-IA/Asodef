import { ConversationStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Readonly<Record<ConversationStatus, readonly ConversationStatus[]>> = {
  AI_ACTIVE: [ConversationStatus.WAITING_USER, ConversationStatus.HUMAN_REQUIRED, ConversationStatus.HUMAN_ACTIVE, ConversationStatus.WAITING_INTERNAL, ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
  WAITING_USER: [ConversationStatus.AI_ACTIVE, ConversationStatus.HUMAN_REQUIRED, ConversationStatus.HUMAN_ACTIVE, ConversationStatus.WAITING_INTERNAL, ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
  HUMAN_REQUIRED: [ConversationStatus.AI_ACTIVE, ConversationStatus.HUMAN_ACTIVE, ConversationStatus.CLOSED],
  HUMAN_ACTIVE: [ConversationStatus.AI_ACTIVE, ConversationStatus.HUMAN_REQUIRED, ConversationStatus.WAITING_USER, ConversationStatus.WAITING_INTERNAL, ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
  WAITING_INTERNAL: [ConversationStatus.AI_ACTIVE, ConversationStatus.WAITING_USER, ConversationStatus.HUMAN_REQUIRED, ConversationStatus.HUMAN_ACTIVE, ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
  RESOLVED: [ConversationStatus.AI_ACTIVE, ConversationStatus.HUMAN_REQUIRED, ConversationStatus.CLOSED],
  CLOSED: [],
};

export function canTransitionConversation(from: ConversationStatus, to: ConversationStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function mayKoralAutoReply(status: ConversationStatus, hasActiveAssignment = false): boolean {
  return !hasActiveAssignment && (status === ConversationStatus.AI_ACTIVE || status === ConversationStatus.WAITING_USER);
}

export function statusAfterInbound(status: ConversationStatus): ConversationStatus {
  if (status === ConversationStatus.WAITING_USER || status === ConversationStatus.RESOLVED) {
    return ConversationStatus.AI_ACTIVE;
  }
  return status;
}
