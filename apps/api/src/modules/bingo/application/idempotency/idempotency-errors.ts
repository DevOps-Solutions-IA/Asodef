export enum BingoIdempotencyErrorCode {
  INVALID_KEY = "BINGO_IDEMPOTENCY_INVALID_KEY",
  INVALID_SCOPE = "BINGO_IDEMPOTENCY_INVALID_SCOPE",
  INVALID_REQUEST = "BINGO_IDEMPOTENCY_INVALID_REQUEST",
  KEY_REUSED_WITH_DIFFERENT_REQUEST = "BINGO_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
  INVALID_RESULT = "BINGO_IDEMPOTENCY_INVALID_RESULT",
  INVALID_STATE = "BINGO_IDEMPOTENCY_INVALID_STATE",
}

export class BingoIdempotencyError extends Error {
  constructor(
    readonly code: BingoIdempotencyErrorCode,
    readonly details: Readonly<Record<string, string | number | boolean>> = {},
  ) {
    super(code);
    this.name = "BingoIdempotencyError";
  }
}
