import { randomInt } from 'node:crypto';

import type { RandomSource } from './random-source';

export class CryptoRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive safe integer');
    }

    return randomInt(maxExclusive);
  }
}
