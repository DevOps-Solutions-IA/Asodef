import {
  BINGO_CARD_ERROR_CODES,
  BingoCardDomainError,
} from './card-domain-error';
import {
  BINGO_FREE_INDEX,
  BINGO_FREE_VALUE,
  calculateLayoutHash,
  canonicalCardBytes,
  createCanonicalCard,
  createNumberMask,
  hasBall,
  validateCardNumbers,
} from './canonical-card';

const VALID_CARD = [
  1, 16, 31, 46, 61, 2, 17, 32, 47, 62, 3, 18, 0, 48, 63, 4, 19, 33,
  49, 64, 5, 20, 34, 50, 65,
] as const;

describe('canonical Bingo card', () => {
  it('uses the row-major PostgreSQL layout and zero as the FREE sentinel', () => {
    expect(() => validateCardNumbers(VALID_CARD)).not.toThrow();
    expect(VALID_CARD[BINGO_FREE_INDEX]).toBe(BINGO_FREE_VALUE);
    expect(canonicalCardBytes(VALID_CARD).subarray(-25)).toEqual(
      Buffer.from(VALID_CARD),
    );
  });

  it.each([
    ['wrong length', VALID_CARD.slice(0, 24)],
    ['non-integer', VALID_CARD.map((value, index) => (index === 0 ? 1.5 : value))],
    ['wrong FREE value', VALID_CARD.map((value, index) => (index === 12 ? 35 : value))],
    ['wrong column', VALID_CARD.map((value, index) => (index === 0 ? 16 : value))],
    ['duplicate', VALID_CARD.map((value, index) => (index === 5 ? 1 : value))],
  ])('rejects an invalid layout: %s', (_, numbers) => {
    expect(() => validateCardNumbers(numbers)).toThrow(
      expect.objectContaining({ code: BINGO_CARD_ERROR_CODES.INVALID_LAYOUT }),
    );
  });

  it('builds a consistent 75-bit mask with exactly 24 playable balls', () => {
    const mask = createNumberMask(VALID_CARD);

    expect(countBits(mask)).toBe(24);
    for (const ball of VALID_CARD.filter((value) => value !== 0)) {
      expect(hasBall(mask, ball)).toBe(true);
    }
    expect(hasBall(mask, 15)).toBe(false);
    expect(hasBall(mask, 0)).toBe(false);
    expect(hasBall(mask, 76)).toBe(false);
  });

  it('creates an immutable card and a stable, versioned SHA-256 layout hash', () => {
    const first = createCanonicalCard(VALID_CARD);
    const second = createCanonicalCard([...VALID_CARD]);

    expect(first.layoutHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.layoutHash).toBe(second.layoutHash);
    expect(first.layoutHash).toBe(calculateLayoutHash(VALID_CARD));
    expect(first.generationVersion).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.numbers)).toBe(true);
  });

  it('changes the fingerprint when the canonical layout changes', () => {
    const changed: number[] = [...VALID_CARD];
    const first = changed[0]!;
    changed[0] = changed[5]!;
    changed[5] = first;

    expect(calculateLayoutHash(changed)).not.toBe(calculateLayoutHash(VALID_CARD));
  });

  it('exposes structured validation errors', () => {
    try {
      createCanonicalCard([]);
      throw new Error('expected createCanonicalCard to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BingoCardDomainError);
      expect(error).toMatchObject({
        code: BINGO_CARD_ERROR_CODES.INVALID_LAYOUT,
        details: { actualLength: 0 },
      });
    }
  });
});

function countBits(value: bigint): number {
  let count = 0;
  let remaining = value;
  while (remaining !== 0n) {
    remaining &= remaining - 1n;
    count += 1;
  }
  return count;
}
