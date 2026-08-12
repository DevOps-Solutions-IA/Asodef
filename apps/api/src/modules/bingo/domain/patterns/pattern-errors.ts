export const BINGO_PATTERN_ERROR_CODES = {
  CONFIGURATION_NOT_FROZEN: "BINGO_PATTERN_CONFIGURATION_NOT_FROZEN",
  DUPLICATE_CARD_REFERENCE: "BINGO_PATTERN_DUPLICATE_CARD_REFERENCE",
  INVALID_DRAW_SEQUENCE: "BINGO_PATTERN_INVALID_DRAW_SEQUENCE",
  INVALID_MASK: "BINGO_PATTERN_INVALID_MASK",
  INVALID_PATTERN: "BINGO_PATTERN_INVALID_CONFIGURATION",
} as const;

export type BingoPatternErrorCode =
  (typeof BINGO_PATTERN_ERROR_CODES)[keyof typeof BINGO_PATTERN_ERROR_CODES];

export class BingoPatternDomainError extends Error {
  constructor(
    readonly code: BingoPatternErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "BingoPatternDomainError";
  }
}
