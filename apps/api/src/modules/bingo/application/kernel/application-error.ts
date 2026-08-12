export enum BingoApplicationErrorCode {
  FORBIDDEN = "BINGO_APPLICATION_FORBIDDEN",
  INVALID_CONTEXT = "BINGO_INVALID_COMMAND_CONTEXT",
  NOT_FOUND = "BINGO_EXECUTION_NOT_FOUND",
  INVALID_STATE = "BINGO_INVALID_STATE_TRANSITION",
  CONFIGURATION_NOT_FROZEN = "BINGO_CONFIGURATION_NOT_FROZEN",
  CONFIGURATION_SNAPSHOT_MISMATCH = "BINGO_CONFIGURATION_SNAPSHOT_MISMATCH",
  ACTIVE_EXECUTION_EXISTS = "BINGO_ACTIVE_EXECUTION_EXISTS",
  DUAL_CONTROL_REQUIRED = "BINGO_DUAL_CONTROL_REQUIRED",
  CANCELLATION_REASON_REQUIRED = "BINGO_CANCELLATION_REASON_REQUIRED",
  COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY = "COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY",
  TRANSACTION_RETRY_EXHAUSTED = "BINGO_TRANSACTION_RETRY_EXHAUSTED",
}

export class BingoApplicationError extends Error {
  constructor(
    public readonly code: BingoApplicationErrorCode,
    public readonly details: Readonly<Record<string, unknown>> = {},
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "BingoApplicationError";
  }
}

export function assertCommandContext(context: CommandContextLike): void {
  if (
    context.actorUserId.trim().length === 0 ||
    context.requestId.trim().length === 0 ||
    context.idempotencyKey.trim().length === 0 ||
    !/^[0-9a-f]{64}$/.test(context.idempotencyKeyHash) ||
    !/^[0-9a-f]{64}$/.test(context.requestHash)
  ) {
    throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_CONTEXT);
  }
}

interface CommandContextLike {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
}
