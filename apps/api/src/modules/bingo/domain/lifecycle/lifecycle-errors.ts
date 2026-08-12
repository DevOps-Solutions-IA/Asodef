export enum BingoLifecycleErrorCode {
  INVALID_STATE_TRANSITION = "BINGO_INVALID_STATE_TRANSITION",
  EXECUTION_CANCELLATION_FORBIDDEN = "BINGO_EXECUTION_CANCELLATION_FORBIDDEN",
  CANCELLATION_REASON_REQUIRED = "BINGO_CANCELLATION_REASON_REQUIRED",
  EVENT_CONFIGURATION_LOCKED = "BINGO_EVENT_CONFIGURATION_LOCKED",
  ROUND_CONFIGURATION_LOCKED = "BINGO_ROUND_CONFIGURATION_LOCKED",
  PATTERN_CONFIGURATION_LOCKED = "BINGO_PATTERN_CONFIGURATION_LOCKED",
  INVALID_RESTART = "BINGO_INVALID_RESTART",
  RESTART_SUPERVISOR_REQUIRED = "BINGO_RESTART_SUPERVISOR_REQUIRED",
}

export interface BingoLifecycleErrorDetails {
  readonly aggregate?: "EVENT" | "ROUND" | "EXECUTION";
  readonly from?: string;
  readonly to?: string;
  readonly changedFields?: readonly string[];
  readonly executionId?: string;
  readonly roundId?: string;
}

export class BingoLifecycleError extends Error {
  constructor(
    public readonly code: BingoLifecycleErrorCode,
    public readonly details: BingoLifecycleErrorDetails = {},
  ) {
    super(code);
    this.name = "BingoLifecycleError";
  }
}

export type BingoLifecycleDecision<T> =
  | { readonly allowed: true; readonly value: T }
  | {
      readonly allowed: false;
      readonly code: BingoLifecycleErrorCode;
      readonly details: BingoLifecycleErrorDetails;
    };

export function requireLifecycleDecision<T>(
  decision: BingoLifecycleDecision<T>,
): T {
  if (!decision.allowed) {
    throw new BingoLifecycleError(decision.code, decision.details);
  }

  return decision.value;
}
