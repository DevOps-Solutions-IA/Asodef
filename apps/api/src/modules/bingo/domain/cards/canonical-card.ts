import { createHash } from 'node:crypto';

import {
  BINGO_CARD_ERROR_CODES,
  BingoCardDomainError,
} from './card-domain-error';

export const BINGO_CARD_SIZE = 25;
export const BINGO_FREE_INDEX = 12;
export const BINGO_FREE_VALUE = 0;
export const BINGO_LAYOUT_VERSION = 1;

const LAYOUT_HASH_PREFIX = Buffer.from('ASODEF:BINGO75:CARD:V1\0', 'utf8');
const COLUMN_RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
] as const;

export type BingoCardNumbers = readonly number[];

export interface CanonicalBingoCard {
  readonly numbers: BingoCardNumbers;
  /** A 75-bit in-memory set: ball n maps to bit n - 1. */
  readonly numberMask: bigint;
  readonly layoutHash: string;
  readonly generationVersion: typeof BINGO_LAYOUT_VERSION;
}

export function validateCardNumbers(numbers: BingoCardNumbers): void {
  if (numbers.length !== BINGO_CARD_SIZE) {
    invalidLayout('A canonical card must contain exactly 25 positions', {
      actualLength: numbers.length,
    });
  }

  const seen = new Set<number>();

  for (let index = 0; index < BINGO_CARD_SIZE; index += 1) {
    const value = numbers[index]!;

    if (!Number.isInteger(value)) {
      invalidLayout('Every card position must contain an integer', {
        index,
        value,
      });
    }

    if (index === BINGO_FREE_INDEX) {
      if (value !== BINGO_FREE_VALUE) {
        invalidLayout('The center position must use the canonical FREE sentinel', {
          index,
          value,
        });
      }
      continue;
    }

    const column = index % 5;
    const [minimum, maximum] = COLUMN_RANGES[column]!;
    if (value < minimum || value > maximum) {
      invalidLayout('A card value is outside its B-I-N-G-O column range', {
        column,
        index,
        maximum,
        minimum,
        value,
      });
    }

    if (seen.has(value)) {
      invalidLayout('A playable ball cannot occur more than once in a card', {
        value,
      });
    }
    seen.add(value);
  }
}

export function createCanonicalCard(numbers: BingoCardNumbers): CanonicalBingoCard {
  validateCardNumbers(numbers);
  const immutableNumbers = Object.freeze([...numbers]);

  return Object.freeze({
    generationVersion: BINGO_LAYOUT_VERSION,
    layoutHash: calculateLayoutHash(immutableNumbers),
    numberMask: createNumberMask(immutableNumbers),
    numbers: immutableNumbers,
  });
}

export function createNumberMask(numbers: BingoCardNumbers): bigint {
  validateCardNumbers(numbers);

  let mask = 0n;
  for (const value of numbers) {
    if (value !== BINGO_FREE_VALUE) {
      mask |= 1n << BigInt(value - 1);
    }
  }
  return mask;
}

export function hasBall(mask: bigint, ball: number): boolean {
  if (!Number.isInteger(ball) || ball < 1 || ball > 75) {
    return false;
  }
  return (mask & (1n << BigInt(ball - 1))) !== 0n;
}

export function canonicalCardBytes(numbers: BingoCardNumbers): Buffer {
  validateCardNumbers(numbers);
  return Buffer.concat([LAYOUT_HASH_PREFIX, Buffer.from(numbers)]);
}

export function calculateLayoutHash(numbers: BingoCardNumbers): string {
  return createHash('sha256').update(canonicalCardBytes(numbers)).digest('hex');
}

function invalidLayout(
  message: string,
  details: Readonly<Record<string, unknown>>,
): never {
  throw new BingoCardDomainError(
    BINGO_CARD_ERROR_CODES.INVALID_LAYOUT,
    message,
    details,
  );
}
