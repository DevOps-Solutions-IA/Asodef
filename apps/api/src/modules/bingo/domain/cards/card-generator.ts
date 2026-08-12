import type { RandomSource } from '../random/random-source';
import {
  BINGO_CARD_ERROR_CODES,
  BingoCardDomainError,
} from './card-domain-error';
import {
  BINGO_FREE_INDEX,
  BINGO_FREE_VALUE,
  createCanonicalCard,
  type CanonicalBingoCard,
} from './canonical-card';

const COLUMN_RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
] as const;

export interface GenerateUniqueCardsOptions {
  readonly existingLayoutHashes?: Iterable<string>;
  readonly maxAttempts?: number;
}

export class BingoCardGenerator {
  constructor(private readonly random: RandomSource) {}

  generate(): CanonicalBingoCard {
    const columns = COLUMN_RANGES.map(([minimum, maximum], column) =>
      this.sampleWithoutReplacement(minimum, maximum, column === 2 ? 4 : 5),
    );
    const numbers = new Array<number>(25);

    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const index = row * 5 + column;
        if (index === BINGO_FREE_INDEX) {
          numbers[index] = BINGO_FREE_VALUE;
          continue;
        }

        const columnRow = column === 2 && row > 2 ? row - 1 : row;
        numbers[index] = columns[column]![columnRow]!;
      }
    }

    return createCanonicalCard(numbers);
  }

  generateUnique(
    count: number,
    options: GenerateUniqueCardsOptions = {},
  ): readonly CanonicalBingoCard[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError('count must be a non-negative safe integer');
    }

    const hashes = new Set(options.existingLayoutHashes ?? []);
    const cards: CanonicalBingoCard[] = [];
    const defaultMaxAttempts = Math.max(100, count * 4);
    const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;

    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < count) {
      throw new RangeError('maxAttempts must be a safe integer at least as large as count');
    }

    let attempts = 0;
    while (cards.length < count && attempts < maxAttempts) {
      attempts += 1;
      const card = this.generate();
      if (hashes.has(card.layoutHash)) {
        continue;
      }
      hashes.add(card.layoutHash);
      cards.push(card);
    }

    if (cards.length !== count) {
      throw new BingoCardDomainError(
        BINGO_CARD_ERROR_CODES.UNIQUE_GENERATION_EXHAUSTED,
        'Unable to generate the requested number of unique cards within the attempt limit',
        { attempts, generated: cards.length, requested: count },
      );
    }

    return cards;
  }

  private sampleWithoutReplacement(
    minimum: number,
    maximum: number,
    count: number,
  ): number[] {
    const values = Array.from(
      { length: maximum - minimum + 1 },
      (_, index) => minimum + index,
    );

    // Partial Fisher-Yates: exactly `count` unbiased selections are required.
    for (let index = 0; index < count; index += 1) {
      const remaining = values.length - index;
      const offset = this.random.nextInt(remaining);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= remaining) {
        throw new BingoCardDomainError(
          BINGO_CARD_ERROR_CODES.INVALID_RANDOM_VALUE,
          'RandomSource returned a value outside its declared interval',
          { maxExclusive: remaining, value: offset },
        );
      }
      const swapIndex = index + offset;
      const current = values[index]!;
      values[index] = values[swapIndex]!;
      values[swapIndex] = current;
    }

    return values.slice(0, count);
  }
}
