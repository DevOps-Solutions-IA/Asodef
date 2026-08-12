export enum BingoRestartErrorCode {
  FORBIDDEN = "BINGO_RESTART_FORBIDDEN",
  NOT_FOUND = "BINGO_RESTART_EXECUTION_NOT_FOUND",
  PREVIOUS_EXECUTION_NOT_LATEST = "BINGO_RESTART_PREVIOUS_EXECUTION_NOT_LATEST",
  IDEMPOTENCY_IN_PROGRESS = "BINGO_RESTART_IDEMPOTENCY_IN_PROGRESS",
  INVALID_COMMAND_CONTEXT = "BINGO_RESTART_INVALID_COMMAND_CONTEXT",
}

export class BingoRestartError extends Error {
  constructor(
    public readonly code: BingoRestartErrorCode,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = "BingoRestartError";
  }
}
