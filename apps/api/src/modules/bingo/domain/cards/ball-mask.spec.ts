import {
  BINGO_FULL_BALL_MASK,
  ballMask,
  fromPostgresBit75,
  toPostgresBit75,
} from "./ball-mask";
import { BINGO_CARD_ERROR_CODES } from "./card-domain-error";

describe("PostgreSQL bit(75) Bingo adapter", () => {
  it("maps B1 to the left-most PostgreSQL bit", () => {
    expect(toPostgresBit75(ballMask(1))).toBe(`1${"0".repeat(74)}`);
    expect(fromPostgresBit75(`1${"0".repeat(74)}`)).toBe(1n);
  });

  it("maps O75 to the right-most PostgreSQL bit", () => {
    expect(toPostgresBit75(ballMask(75))).toBe(`${"0".repeat(74)}1`);
    expect(fromPostgresBit75(`${"0".repeat(74)}1`)).toBe(1n << 74n);
  });

  it("round-trips empty, sparse and full masks", () => {
    for (const mask of [0n, ballMask(1, 5, 37, 75), BINGO_FULL_BALL_MASK]) {
      expect(fromPostgresBit75(toPostgresBit75(mask))).toBe(mask);
    }
  });

  it.each([[-1n], [1n << 75n]])(
    "rejects an out-of-domain bigint: %s",
    (mask) => {
      expect(() => toPostgresBit75(mask)).toThrow(
        expect.objectContaining({
          code: BINGO_CARD_ERROR_CODES.INVALID_BALL_MASK,
        }),
      );
    },
  );

  it.each(["", "0".repeat(74), "0".repeat(76), `${"0".repeat(74)}x`])(
    "rejects a malformed PostgreSQL bit string",
    (value) => {
      expect(() => fromPostgresBit75(value)).toThrow(
        expect.objectContaining({
          code: BINGO_CARD_ERROR_CODES.INVALID_BALL_MASK,
        }),
      );
    },
  );
});
