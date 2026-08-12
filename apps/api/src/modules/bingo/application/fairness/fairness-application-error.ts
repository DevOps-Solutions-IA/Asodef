export enum BingoFairnessApplicationErrorCode {
  NO_BALLS_REMAINING = "BINGO_NO_BALLS_REMAINING",
  INVALID_AVAILABLE_BALLS = "BINGO_FAIRNESS_INVALID_AVAILABLE_BALLS",
  INVALID_DRAW_SEQUENCE = "BINGO_FAIRNESS_INVALID_DRAW_SEQUENCE",
  INVALID_EXECUTION_ID = "BINGO_FAIRNESS_INVALID_EXECUTION_ID",
  INVALID_CONFIGURATION_HASH = "BINGO_FAIRNESS_INVALID_CONFIGURATION_HASH",
  INVALID_PROTECTED_SEED = "BINGO_FAIRNESS_INVALID_PROTECTED_SEED",
  UNSUPPORTED_ALGORITHM = "BINGO_FAIRNESS_UNSUPPORTED_ALGORITHM",
  COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY = "COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY",
}

export interface BingoFairnessApplicationErrorDetails {
  readonly field?: string;
  readonly reason?: string;
}

export class BingoFairnessApplicationError extends Error {
  constructor(
    public readonly code: BingoFairnessApplicationErrorCode,
    public readonly details: BingoFairnessApplicationErrorDetails = {},
  ) {
    super(code);
    this.name = "BingoFairnessApplicationError";
  }
}

export function failFairnessApplication(
  code: BingoFairnessApplicationErrorCode,
  details: BingoFairnessApplicationErrorDetails = {},
): never {
  throw new BingoFairnessApplicationError(code, details);
}
