import { createHash } from "node:crypto";

import {
  COMMIT_REVEAL_DRAW_ALGORITHM,
  CommitRevealBallSelector,
  deriveCommitRevealBall,
} from "./commit-reveal-random";
import { BingoFairnessApplicationErrorCode } from "./fairness-application-error";
import {
  ProtectedSeedReference,
  SeedCustody,
  SeedCustodyContext,
  UnavailableSeedCustody,
} from "./seed-custody";

const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
const executionId = "30000000-0000-4000-8000-000000000003";
const configurationHash =
  "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
const protectedSeed = {
  ciphertext: "opaque-authenticated-envelope",
  custodyKeyId: "bingo-seed-custody-v1",
};
const custodyContext: SeedCustodyContext = {
  eventId: "10000000-0000-4000-8000-000000000001",
  roundId: "20000000-0000-4000-8000-000000000002",
  executionId,
  revision: 1,
  protocolVersion: "asodef-bingo-commit-reveal-v1",
};

class TestSeedCustody implements SeedCustody {
  async generateAndProtect<TResult>(
    _context: SeedCustodyContext,
    consume: (value: Uint8Array) => TResult,
  ): Promise<{ protectedSeed: ProtectedSeedReference; result: TResult }> {
    return { protectedSeed, result: consume(seed.slice()) };
  }

  async withProtectedSeed<TResult>(
    _protectedSeed: ProtectedSeedReference,
    _context: SeedCustodyContext,
    consume: (value: Uint8Array) => TResult,
  ): Promise<TResult> {
    return consume(seed.slice());
  }
}

describe("commit-reveal deterministic draw derivation", () => {
  it("matches a stable v1 vector", () => {
    expect(
      deriveCommitRevealBall(seed, {
        executionId,
        configurationHash,
        drawSequence: 1,
        availableBalls: [75, 1, 42, 17, 63],
      }),
    ).toEqual({
      ball: 63,
      evidence: {
        evidenceVersion: "asodef-bingo-draw-evidence-v1",
        fairnessMode: "CRYPTO_RNG_COMMIT_REVEAL",
        algorithmId: COMMIT_REVEAL_DRAW_ALGORITHM,
        availableBallCount: 5,
        availableBallsHash:
          "d925c945d60cfdac0bb0084c2decfda14f450d2bc1632c5020523d58459ac036",
        selectedIndex: 3,
      },
      derivationCounter: 0,
      derivationMessageHash:
        "9ec0c9c78f3561653d4a699d63dbc40123692e89989ce3a95517d108a9c96039",
    });
  });

  it("reproduces a complete, unique 75-ball sequence", () => {
    const first = (): number[] => {
      const remaining = Array.from({ length: 75 }, (_, index) => index + 1);
      const draws: number[] = [];
      while (remaining.length > 0) {
        const result = deriveCommitRevealBall(seed, {
          executionId,
          configurationHash,
          drawSequence: draws.length + 1,
          availableBalls: remaining,
        });
        draws.push(result.ball);
        remaining.splice(remaining.indexOf(result.ball), 1);
      }
      return draws;
    };

    const sequence = first();
    expect(first()).toEqual(sequence);
    expect(sequence).toHaveLength(75);
    expect(new Set(sequence).size).toBe(75);
    expect([...sequence].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 75 }, (_, index) => index + 1),
    );
  });

  it("normalizes available ball ordering before deriving", () => {
    const input = {
      executionId,
      configurationHash,
      drawSequence: 4,
      availableBalls: [75, 2, 8, 19, 43],
    };
    expect(deriveCommitRevealBall(seed, input)).toEqual(
      deriveCommitRevealBall(seed, {
        ...input,
        availableBalls: [...input.availableBalls].reverse(),
      }),
    );
  });

  it("has no material distribution skew across independent committed seeds", () => {
    const counts = Array.from({ length: 7 }, () => 0);
    const iterations = 14_000;
    for (let index = 0; index < iterations; index += 1) {
      const independentSeed = createHash("sha256")
        .update(`asodef-fairness-statistical-vector:${index}`)
        .digest();
      const selected = deriveCommitRevealBall(independentSeed, {
        executionId,
        configurationHash,
        drawSequence: 1,
        availableBalls: [1, 2, 3, 4, 5, 6, 7],
      }).ball;
      counts[selected - 1] = counts[selected - 1]! + 1;
    }

    const expected = iterations / counts.length;
    const chiSquare = counts.reduce(
      (sum, observed) => sum + (observed - expected) ** 2 / expected,
      0,
    );
    // df=6. This intentionally loose threshold detects gross derivation bias
    // while avoiding a flaky probabilistic gate over deterministic vectors.
    expect(chiSquare).toBeLessThan(40);
  });

  it.each([
    {
      override: { availableBalls: [] },
      code: BingoFairnessApplicationErrorCode.NO_BALLS_REMAINING,
    },
    {
      override: { drawSequence: 0 },
      code: BingoFairnessApplicationErrorCode.INVALID_DRAW_SEQUENCE,
    },
    {
      override: { executionId: "external-id" },
      code: BingoFairnessApplicationErrorCode.INVALID_EXECUTION_ID,
    },
    {
      override: { configurationHash: "A".repeat(64) },
      code: BingoFairnessApplicationErrorCode.INVALID_CONFIGURATION_HASH,
    },
  ])("fails closed for invalid derivation input", ({ override, code }) => {
    expect(() =>
      deriveCommitRevealBall(seed, {
        executionId,
        configurationHash,
        drawSequence: 1,
        availableBalls: [1, 2],
        ...override,
      }),
    ).toThrow(expect.objectContaining({ code }));
  });

  it("fails closed when the protected seed is not exactly 32 bytes", () => {
    expect(() =>
      deriveCommitRevealBall(new Uint8Array(31), {
        executionId,
        configurationHash,
        drawSequence: 1,
        availableBalls: [1],
      }),
    ).toThrow(
      expect.objectContaining({
        code: BingoFairnessApplicationErrorCode.INVALID_PROTECTED_SEED,
      }),
    );
  });

  it("uses the custody boundary without exposing seed in evidence", async () => {
    const result = await new CommitRevealBallSelector(
      new TestSeedCustody(),
    ).selectBall({
      executionId,
      configurationHash,
      drawSequence: 1,
      availableBalls: [1, 17, 42, 63, 75],
      protectedSeed,
      custodyContext,
    });

    expect(JSON.stringify(result)).not.toContain(
      Buffer.from(seed).toString("hex"),
    );
    expect(JSON.stringify(result)).not.toContain(
      Buffer.from(seed).toString("base64url"),
    );
    expect(JSON.stringify(result)).not.toContain(protectedSeed.ciphertext);
  });

  it("never degrades commit-reveal when no real custody is configured", async () => {
    const unavailable = new UnavailableSeedCustody();
    const selector = new CommitRevealBallSelector(unavailable);
    await expect(
      selector.selectBall({
        executionId,
        configurationHash,
        drawSequence: 1,
        availableBalls: [1, 2, 3],
        protectedSeed,
        custodyContext,
      }),
    ).rejects.toMatchObject({
      code: BingoFairnessApplicationErrorCode.COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY,
    });
    await expect(
      unavailable.generateAndProtect(custodyContext, () => "unreachable"),
    ).rejects.toMatchObject({
      code: BingoFairnessApplicationErrorCode.COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY,
    });
  });
});
