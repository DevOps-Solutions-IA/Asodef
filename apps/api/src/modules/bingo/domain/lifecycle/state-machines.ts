import {
  BingoLifecycleDecision,
  BingoLifecycleErrorCode,
  requireLifecycleDecision,
} from "./lifecycle-errors";

export const BINGO_EVENT_STATUSES = [
  "DRAFT",
  "CONFIGURED",
  "PUBLISHED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
] as const;

export type BingoEventStatus = (typeof BINGO_EVENT_STATUSES)[number];

export const BINGO_ROUND_STATUSES = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type BingoRoundStatus = (typeof BINGO_ROUND_STATUSES)[number];

export const BINGO_EXECUTION_STATUSES = [
  "PLANNED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type BingoExecutionStatus = (typeof BINGO_EXECUTION_STATUSES)[number];

const EVENT_TRANSITIONS: Readonly<
  Record<BingoEventStatus, readonly BingoEventStatus[]>
> = {
  DRAFT: ["CONFIGURED", "CANCELLED"],
  CONFIGURED: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: [],
  ARCHIVED: [],
};

const ROUND_TRANSITIONS: Readonly<
  Record<BingoRoundStatus, readonly BingoRoundStatus[]>
> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const EXECUTION_TRANSITIONS: Readonly<
  Record<BingoExecutionStatus, readonly BingoExecutionStatus[]>
> = {
  PLANNED: ["RUNNING"],
  RUNNING: ["PAUSED", "COMPLETED"],
  PAUSED: ["RUNNING"],
  COMPLETED: [],
  CANCELLED: [],
};

export interface ExecutionCancellationPolicy {
  readonly allowedFrom: readonly Extract<
    BingoExecutionStatus,
    "PLANNED" | "RUNNING" | "PAUSED"
  >[];
  readonly requiresAuthorization: boolean;
}

export interface ExecutionCancellationContext {
  readonly policy: ExecutionCancellationPolicy;
  readonly authorized: boolean;
  readonly reason: string;
}

export const EXECUTION_CANCELLATION_POLICIES = {
  BEFORE_START_ONLY: {
    allowedFrom: ["PLANNED"],
    requiresAuthorization: true,
  },
  ACTIVE_ONLY: {
    allowedFrom: ["RUNNING", "PAUSED"],
    requiresAuthorization: true,
  },
  ANY_NON_TERMINAL: {
    allowedFrom: ["PLANNED", "RUNNING", "PAUSED"],
    requiresAuthorization: true,
  },
} as const satisfies Readonly<Record<string, ExecutionCancellationPolicy>>;

function evaluateTransition<TStatus extends string>(
  aggregate: "EVENT" | "ROUND" | "EXECUTION",
  transitions: Readonly<Record<TStatus, readonly TStatus[]>>,
  from: TStatus,
  to: TStatus,
): BingoLifecycleDecision<TStatus> {
  if (transitions[from].includes(to)) {
    return { allowed: true, value: to };
  }

  return {
    allowed: false,
    code: BingoLifecycleErrorCode.INVALID_STATE_TRANSITION,
    details: { aggregate, from, to },
  };
}

export function evaluateEventTransition(
  from: BingoEventStatus,
  to: BingoEventStatus,
): BingoLifecycleDecision<BingoEventStatus> {
  return evaluateTransition("EVENT", EVENT_TRANSITIONS, from, to);
}

export function transitionEvent(
  from: BingoEventStatus,
  to: BingoEventStatus,
): BingoEventStatus {
  return requireLifecycleDecision(evaluateEventTransition(from, to));
}

export function evaluateRoundTransition(
  from: BingoRoundStatus,
  to: BingoRoundStatus,
): BingoLifecycleDecision<BingoRoundStatus> {
  return evaluateTransition("ROUND", ROUND_TRANSITIONS, from, to);
}

export function transitionRound(
  from: BingoRoundStatus,
  to: BingoRoundStatus,
): BingoRoundStatus {
  return requireLifecycleDecision(evaluateRoundTransition(from, to));
}

export function evaluateExecutionTransition(
  from: BingoExecutionStatus,
  to: BingoExecutionStatus,
  cancellation?: ExecutionCancellationContext,
): BingoLifecycleDecision<BingoExecutionStatus> {
  if (to !== "CANCELLED") {
    return evaluateTransition("EXECUTION", EXECUTION_TRANSITIONS, from, to);
  }

  if (from === "COMPLETED" || from === "CANCELLED") {
    return {
      allowed: false,
      code: BingoLifecycleErrorCode.INVALID_STATE_TRANSITION,
      details: { aggregate: "EXECUTION", from, to },
    };
  }

  if (
    cancellation === undefined ||
    !cancellation.policy.allowedFrom.includes(from)
  ) {
    return {
      allowed: false,
      code: BingoLifecycleErrorCode.EXECUTION_CANCELLATION_FORBIDDEN,
      details: { aggregate: "EXECUTION", from, to },
    };
  }

  if (cancellation.policy.requiresAuthorization && !cancellation.authorized) {
    return {
      allowed: false,
      code: BingoLifecycleErrorCode.EXECUTION_CANCELLATION_FORBIDDEN,
      details: { aggregate: "EXECUTION", from, to },
    };
  }

  if (cancellation.reason.trim().length === 0) {
    return {
      allowed: false,
      code: BingoLifecycleErrorCode.CANCELLATION_REASON_REQUIRED,
      details: { aggregate: "EXECUTION", from, to },
    };
  }

  return { allowed: true, value: to };
}

export function transitionExecution(
  from: BingoExecutionStatus,
  to: BingoExecutionStatus,
  cancellation?: ExecutionCancellationContext,
): BingoExecutionStatus {
  return requireLifecycleDecision(
    evaluateExecutionTransition(from, to, cancellation),
  );
}

export function isEventTerminal(status: BingoEventStatus): boolean {
  return status === "CANCELLED" || status === "ARCHIVED";
}

export function isRoundTerminal(status: BingoRoundStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function isExecutionTerminal(status: BingoExecutionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}
