export enum BingoFairnessErrorCode {
  INVALID_CANONICAL_VALUE = "BINGO_FAIRNESS_INVALID_CANONICAL_VALUE",
  INVALID_UNICODE = "BINGO_FAIRNESS_INVALID_UNICODE",
  INVALID_ISO_TIMESTAMP = "BINGO_FAIRNESS_INVALID_ISO_TIMESTAMP",
  UNSUPPORTED_PROTOCOL_VERSION = "BINGO_FAIRNESS_UNSUPPORTED_PROTOCOL_VERSION",
  INVALID_IDENTIFIER = "BINGO_FAIRNESS_INVALID_IDENTIFIER",
  INVALID_REVISION = "BINGO_FAIRNESS_INVALID_REVISION",
  INVALID_CONFIGURATION_HASH = "BINGO_FAIRNESS_INVALID_CONFIGURATION_HASH",
  INVALID_ALGORITHM_ID = "BINGO_FAIRNESS_INVALID_ALGORITHM_ID",
  INVALID_SEED = "BINGO_FAIRNESS_INVALID_SEED",
  INVALID_COMMITMENT = "BINGO_FAIRNESS_INVALID_COMMITMENT",
}

export interface BingoFairnessErrorDetails {
  readonly path?: string;
  readonly field?: string;
}

export class BingoFairnessError extends Error {
  constructor(
    public readonly code: BingoFairnessErrorCode,
    public readonly details: BingoFairnessErrorDetails = {},
  ) {
    super(code);
    this.name = "BingoFairnessError";
  }
}

export function failFairness(
  code: BingoFairnessErrorCode,
  details: BingoFairnessErrorDetails = {},
): never {
  throw new BingoFairnessError(code, details);
}
