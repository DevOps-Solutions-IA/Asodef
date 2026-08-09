export const BINGO_CARD_ERROR_CODES = {
  INVALID_LAYOUT: 'BINGO_CARD_INVALID_LAYOUT',
  INVALID_RANDOM_VALUE: 'BINGO_CARD_INVALID_RANDOM_VALUE',
  UNIQUE_GENERATION_EXHAUSTED: 'BINGO_CARD_UNIQUE_GENERATION_EXHAUSTED',
} as const;

export type BingoCardErrorCode =
  (typeof BINGO_CARD_ERROR_CODES)[keyof typeof BINGO_CARD_ERROR_CODES];

export class BingoCardDomainError extends Error {
  constructor(
    readonly code: BingoCardErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'BingoCardDomainError';
  }
}
