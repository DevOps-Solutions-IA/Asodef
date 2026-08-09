import {
  BINGO_CARD_ERROR_CODES,
  BingoCardDomainError,
} from "./card-domain-error";

export const BINGO_BALL_COUNT = 75;
export const BINGO_FULL_BALL_MASK = (1n << BigInt(BINGO_BALL_COUNT)) - 1n;

/** Ball n maps to bit n - 1 in the in-memory bigint representation. */
export function ballMask(...balls: readonly number[]): bigint {
  let mask = 0n;
  for (const ball of balls) {
    if (!Number.isInteger(ball) || ball < 1 || ball > BINGO_BALL_COUNT) {
      invalidBallMask({ ball });
    }
    mask |= 1n << BigInt(ball - 1);
  }
  return mask;
}

/**
 * PostgreSQL bit strings index the left-most character as offset zero. This
 * adapter therefore writes ball 1 first and ball 75 last; bigint.toString(2)
 * must not be used directly for persistence.
 */
export function toPostgresBit75(mask: bigint): string {
  validateBallMask(mask);
  let value = "";
  for (let ball = 1; ball <= BINGO_BALL_COUNT; ball += 1) {
    value += (mask & (1n << BigInt(ball - 1))) === 0n ? "0" : "1";
  }
  return value;
}

export function fromPostgresBit75(value: string): bigint {
  if (!/^[01]{75}$/.test(value)) invalidBallMask({ value });
  let mask = 0n;
  for (let index = 0; index < BINGO_BALL_COUNT; index += 1) {
    if (value[index] === "1") mask |= 1n << BigInt(index);
  }
  return mask;
}

export function validateBallMask(mask: bigint): void {
  if (typeof mask !== "bigint" || mask < 0n || mask > BINGO_FULL_BALL_MASK) {
    invalidBallMask({ mask: String(mask) });
  }
}

function invalidBallMask(details: Readonly<Record<string, unknown>>): never {
  throw new BingoCardDomainError(
    BINGO_CARD_ERROR_CODES.INVALID_BALL_MASK,
    "A Bingo ball mask must contain exactly the admitted 75-bit domain",
    details,
  );
}
