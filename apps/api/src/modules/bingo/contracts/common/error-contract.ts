export const BINGO_API_ERROR_CODES = [
  "BINGO_VALIDATION_FAILED",
  "BINGO_NOT_FOUND",
  "BINGO_FORBIDDEN",
  "BINGO_CONFLICT",
  "BINGO_IDEMPOTENCY_CONFLICT",
  "BINGO_COMMAND_IN_PROGRESS",
  "BINGO_INVALID_STATE_TRANSITION",
  "BINGO_CONFIGURATION_LOCKED",
  "BINGO_NO_BALLS_REMAINING",
  "BINGO_DUAL_CONTROL_REQUIRED",
  "BINGO_FAIRNESS_UNAVAILABLE",
  "BINGO_AFFILIATE_IDENTITY_UNRESOLVED",
  "BINGO_PARTICIPATION_NOT_AUTHORIZED",
  "BINGO_RATE_LIMITED",
  "BINGO_RESYNC_REQUIRED",
] as const;

export type BingoApiErrorCode = (typeof BINGO_API_ERROR_CODES)[number];

/** Extends ASODEF's global error envelope without exposing internals. */
export interface BingoApiErrorContract {
  statusCode: number;
  error: string;
  message: string | readonly string[];
  code: BingoApiErrorCode;
  path: string;
  timestamp: string;
  requestId: string;
  details?: Readonly<Record<string, string | number | boolean>>;
}

