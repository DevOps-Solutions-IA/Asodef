import { randomInt } from "node:crypto";

import type { RandomSource } from "./random-source";

export const CRYPTO_RANDOM_INT_MAX_EXCLUSIVE = 2 ** 48 - 1;

export class CryptoRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (
      !Number.isSafeInteger(maxExclusive) ||
      maxExclusive <= 0 ||
      maxExclusive > CRYPTO_RANDOM_INT_MAX_EXCLUSIVE
    ) {
      throw new RangeError(
        `maxExclusive must be between 1 and ${CRYPTO_RANDOM_INT_MAX_EXCLUSIVE}`,
      );
    }

    return randomInt(maxExclusive);
  }
}
