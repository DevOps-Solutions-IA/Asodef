import type { RandomSource } from '../random/random-source';
import { CryptoRandomSource } from '../random/crypto-random-source';
import {
  BINGO_CARD_ERROR_CODES,
  BingoCardDomainError,
} from './card-domain-error';
import { BingoCardGenerator } from './card-generator';
import { BINGO_FREE_INDEX, createNumberMask } from './canonical-card';

describe('BingoCardGenerator', () => {
  it('is deterministic when supplied the same deterministic test source', () => {
    const first = new BingoCardGenerator(new SeededRandomSource(20260809));
    const second = new BingoCardGenerator(new SeededRandomSource(20260809));

    expect(first.generateUnique(1_000)).toEqual(second.generateUnique(1_000));
  });

  it('generates thousands of valid cards with consistent masks and fingerprints', () => {
    const cards = new BingoCardGenerator(
      new SeededRandomSource(0x5eed1234),
    ).generateUnique(5_000);

    expect(new Set(cards.map((card) => card.layoutHash)).size).toBe(5_000);
    for (const card of cards) {
      expect(card.numbers).toHaveLength(25);
      expect(card.numbers[BINGO_FREE_INDEX]).toBe(0);
      expect(new Set(card.numbers).size).toBe(25);
      expect(card.numberMask).toBe(createNumberMask(card.numbers));
      expect(card.layoutHash).toMatch(/^[0-9a-f]{64}$/);
      assertColumnRanges(card.numbers);
    }
  });

  it(
    'supports a reproducible O(n) deduplicated batch of 50,000 cards',
    () => {
      const cards = new BingoCardGenerator(
        new SeededRandomSource(0xb1_90_75),
      ).generateUnique(50_000);
      const hashes = new Set(cards.map((card) => card.layoutHash));

      expect(cards).toHaveLength(50_000);
      expect(hashes.size).toBe(50_000);
    },
    60_000,
  );

  it('excludes layouts that are already reserved by an event', () => {
    const seed = 99;
    const reserved = new BingoCardGenerator(
      new SeededRandomSource(seed),
    ).generate().layoutHash;
    const cards = new BingoCardGenerator(
      new SeededRandomSource(seed),
    ).generateUnique(10, { existingLayoutHashes: [reserved] });

    expect(cards.map((card) => card.layoutHash)).not.toContain(reserved);
    expect(new Set(cards.map((card) => card.layoutHash)).size).toBe(10);
  });

  it('fails with a structured error when a source cannot produce uniqueness', () => {
    const generator = new BingoCardGenerator(new ConstantRandomSource());

    expect(() => generator.generateUnique(2, { maxAttempts: 3 })).toThrow(
      expect.objectContaining({
        code: BINGO_CARD_ERROR_CODES.UNIQUE_GENERATION_EXHAUSTED,
        details: { attempts: 3, generated: 1, requested: 2 },
      } satisfies Partial<BingoCardDomainError>),
    );
  });

  it('rejects a RandomSource that violates its interval contract', () => {
    const invalid: RandomSource = {
      nextInt: (maxExclusive) => maxExclusive,
    };

    expect(() => new BingoCardGenerator(invalid).generate()).toThrow(
      expect.objectContaining({
        code: BINGO_CARD_ERROR_CODES.INVALID_RANDOM_VALUE,
      }),
    );
  });

  it('uses the cryptographic adapter without consulting Math.random', () => {
    const mathRandom = jest
      .spyOn(Math, 'random')
      .mockImplementation(() => {
        throw new Error('Math.random must never be used for Bingo cards');
      });

    try {
      expect(
        new BingoCardGenerator(new CryptoRandomSource()).generate(),
      ).toBeDefined();
      expect(mathRandom).not.toHaveBeenCalled();
    } finally {
      mathRandom.mockRestore();
    }
  });
});

class ConstantRandomSource implements RandomSource {
  nextInt(): number {
    return 0;
  }
}

/** Test-only reproducible source using rejection to avoid modulo bias. */
class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be positive');
    }

    const range = 0x1_0000_0000;
    const limit = Math.floor(range / maxExclusive) * maxExclusive;
    let value: number;
    do {
      value = this.nextUint32();
    } while (value >= limit);
    return value % maxExclusive;
  }

  private nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}

function assertColumnRanges(numbers: readonly number[]): void {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ] as const;

  for (let index = 0; index < numbers.length; index += 1) {
    if (index === BINGO_FREE_INDEX) continue;
    const [minimum, maximum] = ranges[index % 5]!;
    expect(numbers[index]!).toBeGreaterThanOrEqual(minimum);
    expect(numbers[index]!).toBeLessThanOrEqual(maximum);
  }
}
