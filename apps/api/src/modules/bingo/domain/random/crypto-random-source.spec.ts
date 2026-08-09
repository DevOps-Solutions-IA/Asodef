import { CryptoRandomSource } from './crypto-random-source';

describe('CryptoRandomSource', () => {
  it('honors the declared half-open interval', () => {
    const source = new CryptoRandomSource();

    for (let index = 0; index < 2_000; index += 1) {
      const value = source.nextInt(15);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(15);
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid bounds: %s',
    (maximum) => {
      expect(() => new CryptoRandomSource().nextInt(maximum)).toThrow(RangeError);
    },
  );
});
