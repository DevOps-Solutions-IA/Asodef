import { Participant } from "./participant";

export type AssignmentBlockCode =
  | "PARTICIPANT_NOT_APPROVED"
  | "PARTICIPANT_EVENT_MISMATCH"
  | "CARD_EVENT_MISMATCH"
  | "CARD_ALREADY_ASSIGNED"
  | "INVALID_CARD_LIMIT"
  | "INVALID_ACTIVE_CARD_COUNT"
  | "CARD_LIMIT_REACHED"
  | "EVENT_NOT_ASSIGNABLE"
  | "ROUND_NOT_ASSIGNABLE"
  | "EXECUTION_ALREADY_STARTED"
  | "CURRENT_ASSIGNMENT_NOT_ACTIVE"
  | "CURRENT_ASSIGNMENT_SCOPE_MISMATCH"
  | "REASSIGNMENT_REASON_REQUIRED";

export type AssignmentDecision =
  | Readonly<{ allowed: true; code: "ASSIGNMENT_ALLOWED" }>
  | Readonly<{ allowed: false; code: AssignmentBlockCode }>;

export type AssignmentEventStatus =
  | "DRAFT"
  | "CONFIGURED"
  | "PUBLISHED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

export type AssignmentRoundStatus =
  "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type AssignmentExecution = Readonly<{
  status: "PLANNED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
  startedAt?: Date;
}>;

export type CardAssignmentContext = Readonly<{
  eventId: string;
  participant: Participant;
  cardEventId: string;
  cardHasActiveAssignment: boolean;
  participantActiveCardCount: number;
  maxCardsPerParticipant: number;
  eventStatus: AssignmentEventStatus;
  roundStatus: AssignmentRoundStatus;
  execution?: AssignmentExecution;
  now: Date;
}>;

function denied(code: AssignmentBlockCode): AssignmentDecision {
  return { allowed: false, code };
}

function validateCommon(context: CardAssignmentContext): AssignmentDecision {
  if (context.participant.status !== "APPROVED") {
    return denied("PARTICIPANT_NOT_APPROVED");
  }
  if (context.participant.eventId !== context.eventId) {
    return denied("PARTICIPANT_EVENT_MISMATCH");
  }
  if (context.cardEventId !== context.eventId) {
    return denied("CARD_EVENT_MISMATCH");
  }
  if (
    !Number.isInteger(context.maxCardsPerParticipant) ||
    context.maxCardsPerParticipant < 1
  ) {
    return denied("INVALID_CARD_LIMIT");
  }
  if (
    !Number.isInteger(context.participantActiveCardCount) ||
    context.participantActiveCardCount < 0
  ) {
    return denied("INVALID_ACTIVE_CARD_COUNT");
  }
  if (context.participantActiveCardCount >= context.maxCardsPerParticipant) {
    return denied("CARD_LIMIT_REACHED");
  }
  if (
    context.eventStatus !== "DRAFT" &&
    context.eventStatus !== "CONFIGURED" &&
    context.eventStatus !== "PUBLISHED"
  ) {
    return denied("EVENT_NOT_ASSIGNABLE");
  }
  if (context.roundStatus !== "DRAFT" && context.roundStatus !== "READY") {
    return denied("ROUND_NOT_ASSIGNABLE");
  }
  if (
    (context.execution?.startedAt !== undefined &&
      context.execution.startedAt.getTime() <= context.now.getTime()) ||
    (context.execution !== undefined &&
      ["RUNNING", "PAUSED", "COMPLETED"].includes(context.execution.status))
  ) {
    return denied("EXECUTION_ALREADY_STARTED");
  }
  return { allowed: true, code: "ASSIGNMENT_ALLOWED" };
}

export function canAssignCard(
  context: CardAssignmentContext,
): AssignmentDecision {
  const common = validateCommon(context);
  if (!common.allowed) {
    return common;
  }
  return context.cardHasActiveAssignment
    ? denied("CARD_ALREADY_ASSIGNED")
    : common;
}

export type ReassignmentContext = CardAssignmentContext &
  Readonly<{
    currentAssignment: Readonly<{
      eventId: string;
      cardEventId: string;
      status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
    }>;
    reason: string;
  }>;

export function canReassignCard(
  context: ReassignmentContext,
): AssignmentDecision {
  if (context.currentAssignment.status !== "ACTIVE") {
    return denied("CURRENT_ASSIGNMENT_NOT_ACTIVE");
  }
  if (
    context.currentAssignment.eventId !== context.eventId ||
    context.currentAssignment.cardEventId !== context.cardEventId
  ) {
    return denied("CURRENT_ASSIGNMENT_SCOPE_MISMATCH");
  }
  if (context.reason.trim() === "") {
    return denied("REASSIGNMENT_REASON_REQUIRED");
  }
  // The existing active assignment is the row being replaced; it is not a
  // conflicting assignment for this decision.
  return validateCommon({ ...context, cardHasActiveAssignment: false });
}
