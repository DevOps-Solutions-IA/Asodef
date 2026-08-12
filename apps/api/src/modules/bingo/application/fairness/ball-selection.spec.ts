import type { RandomSource } from "../../domain/random";
import {
  BINGO_DRAW_EVIDENCE_VERSION,
  CRYPTO_RNG_DRAW_ALGORITHM,
  CryptoBallSelector,
  normalizeAvailableBalls,
} from "./ball-selection";
import { BingoFairnessApplicationErrorCode } from "./fairness-application-error";

class FixedRandomSource implements RandomSource {
  constructor(private readonly value: number) {}

  nextInt(maxExclusive: number): number {
    if (this.value >= maxExclusive) {
      throw new RangeError("fixed value is outside the requested interval");
    }
    return this.value;
  }
}

describe("CryptoBallSelector", () => {
  it("selects uniformly by index from a canonical, sorted set", () => {
    const result = new CryptoBallSelector(new FixedRandomSource(1)).selectBall([
      75, 1, 42,
    ]);

    expect(result).toEqual({
      ball: 42,
      evidence: {
        evidenceVersion: BINGO_DRAW_EVIDENCE_VERSION,
        fairnessMode: "CRYPTO_RNG",
        algorithmId: CRYPTO_RNG_DRAW_ALGORITHM,
        availableBallCount: 3,
        availableBallsHash:
          "d6d0bd1a5e0c0c24a01172ad629b805ef736c81cd62b4d2975677ea56b266203",
        selectedIndex: 1,
      },
    });
    expect(Object.keys(result.evidence).sort()).toEqual([
      "algorithmId",
      "availableBallCount",
      "availableBallsHash",
      "evidenceVersion",
      "fairnessMode",
      "selectedIndex",
    ]);
  });

  it.each([
    { balls: [], code: BingoFairnessApplicationErrorCode.NO_BALLS_REMAINING },
    {
      balls: [1, 1],
      code: BingoFairnessApplicationErrorCode.INVALID_AVAILABLE_BALLS,
    },
    {
      balls: [0],
      code: BingoFairnessApplicationErrorCode.INVALID_AVAILABLE_BALLS,
    },
    {
      balls: [76],
      code: BingoFairnessApplicationErrorCode.INVALID_AVAILABLE_BALLS,
    },
    {
      balls: [1.5],
      code: BingoFairnessApplicationErrorCode.INVALID_AVAILABLE_BALLS,
    },
  ])("fails closed for invalid available balls: $balls", ({ balls, code }) => {
    expect(() => normalizeAvailableBalls(balls)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("uses the operating-system CSPRNG without material distribution skew", () => {
    const selector = new CryptoBallSelector();
    const counts = Array.from({ length: 6 }, () => 0);
    const iterations = 60_000;

    for (let index = 0; index < iterations; index += 1) {
      const slot = selector.selectBall([1, 2, 3, 4, 5, 6]).ball - 1;
      counts[slot] = counts[slot]! + 1;
    }

    const expected = iterations / counts.length;
    const chiSquare = counts.reduce(
      (sum, observed) => sum + (observed - expected) ** 2 / expected,
      0,
    );
    // df=5; 35 is deliberately far beyond the 99.999% critical value to
    // catch gross implementation bias without making CSPRNG tests flaky.
    expect(chiSquare).toBeLessThan(35);
  });
});
