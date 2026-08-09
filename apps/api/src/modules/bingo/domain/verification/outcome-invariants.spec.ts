import type { PatternCandidate } from "../patterns";
import {
  createWinnerCandidate,
  resolveTieOutcome,
  validateCandidate,
  type ValidatedCandidate,
  type WinnerCandidate,
} from "../outcomes";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const DRAW = {
  ball: 61,
  evidenceHash: "draw-evidence-hash",
  id: "draw-5",
  sequence: 5,
};

describe("Bingo outcome deterministic properties", () => {
  it("keeps candidate fingerprints stable when evidence masks are permuted", () => {
    for (let index = 0; index < 500; index += 1) {
      const cardId = `card-${index}`;
      const canonical = createCandidate(cardId, false);
      const permuted = createCandidate(cardId, true);
      expect(permuted.fingerprint).toBe(canonical.fingerprint);
      expect(permuted.id).toBe(canonical.id);
    }
  });

  it("keeps the complete simultaneous winner set and outcome independent of input order", () => {
    const random = new SeededRandom(0x71e0a7);
    const candidates = Array.from({ length: 100 }, (_, index) =>
      validate(createCandidate(`card-${String(index).padStart(3, "0")}`)),
    );
    const baseline = resolveTieOutcome({
      candidates,
      prize: { kind: "MONEY", currency: "COP", minorUnits: 10_007n },
      prizeId: "prize-1",
      tie: { configurationFrozen: true, policy: "SPLIT_PRIZE" },
    });
    expect(baseline).toMatchObject({
      resolved: true,
      policy: "SPLIT_PRIZE",
      winners: { length: 100 },
      remainder: { kind: "MONEY", currency: "COP", minorUnits: 7n },
    });

    for (let permutation = 0; permutation < 50; permutation += 1) {
      expect(
        resolveTieOutcome({
          candidates: shuffle(candidates, random),
          prize: { kind: "MONEY", currency: "COP", minorUnits: 10_007n },
          prizeId: "prize-1",
          tie: { configurationFrozen: true, policy: "SPLIT_PRIZE" },
        }),
      ).toEqual(baseline);
    }
  });

  it("preserves exact split arithmetic and explicit remainder across candidate counts", () => {
    const pool = Array.from({ length: 100 }, (_, index) =>
      validate(createCandidate(`split-card-${index}`)),
    );

    for (let count = 1; count <= pool.length; count += 1) {
      const amount = BigInt(10_000 + count * 17);
      const result = resolveTieOutcome({
        candidates: pool.slice(0, count),
        prize: { kind: "MONEY", currency: "COP", minorUnits: amount },
        prizeId: `prize-${count}`,
        tie: { configurationFrozen: true, policy: "SPLIT_PRIZE" },
      });
      if (!result.resolved) throw new Error(result.code);

      const payable = result.winners.reduce((sum, winner) => {
        if (winner.allocation.kind !== "MONEY")
          throw new Error("Expected money allocation");
        expect(winner.allocation.exactShareNumerator).toBe(amount);
        expect(winner.allocation.exactShareDenominator).toBe(BigInt(count));
        return sum + winner.allocation.payableMinorUnits;
      }, 0n);
      if (result.remainder.kind !== "MONEY")
        throw new Error("Expected money remainder");
      expect(result.winners).toHaveLength(count);
      expect(payable + result.remainder.minorUnits).toBe(amount);
      expect(result.remainder.minorUnits).toBe(amount % BigInt(count));
    }
  });

  it("enforces dual control for every same-actor mutation and permits distinct authorized actors", () => {
    const candidates = Array.from({ length: 200 }, (_, index) =>
      createCandidate(`dual-card-${index}`),
    );
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const operator = `actor-${index}`;
      expect(
        validateCandidate({
          candidate,
          policy: "DUAL_CONTROL",
          operatorActorId: operator,
          validatorActorId: operator,
          validatorAuthorized: true,
          action: "APPROVE",
          now: NOW,
        }),
      ).toEqual({ accepted: false, code: "DUAL_CONTROL_ACTOR_CONFLICT" });
      expect(
        validateCandidate({
          candidate,
          policy: "DUAL_CONTROL",
          operatorActorId: operator,
          validatorActorId: `supervisor-${index}`,
          validatorAuthorized: false,
          action: "APPROVE",
          now: NOW,
        }),
      ).toEqual({ accepted: false, code: "VALIDATOR_NOT_AUTHORIZED" });
      expect(
        validateCandidate({
          candidate,
          policy: "DUAL_CONTROL",
          operatorActorId: operator,
          validatorActorId: `supervisor-${index}`,
          validatorAuthorized: true,
          action: "APPROVE",
          now: NOW,
        }),
      ).toMatchObject({
        accepted: true,
        code: "CANDIDATE_VALIDATED",
        result: {
          status: "VALIDATED",
          validatorActorId: `supervisor-${index}`,
        },
      });
    }
  });
});

function patternCandidate(
  cardId: string,
  reverseMasks: boolean,
): PatternCandidate {
  const masks = [
    {
      completedAtDrawSequence: 5,
      id: "mask-a",
      positionMask: 31,
      requiredBallMask: 1n,
      sequence: 1,
    },
    {
      completedAtDrawSequence: 4,
      id: "mask-b",
      positionMask: 992,
      requiredBallMask: 2n,
      sequence: 2,
    },
  ];
  return {
    cardId,
    cardLayoutHash: `layout-${cardId}`,
    evaluation: {
      decisiveBall: DRAW.ball,
      decisiveDrawSequence: DRAW.sequence,
      evidence: {
        cardLayoutHash: `layout-${cardId}`,
        drawnBallMaskAtDecision: 31n,
        matchedPatternMasks: reverseMasks ? [...masks].reverse() : masks,
      },
      matched: true,
      matchedNumbersMask: 3n,
      matchedPositionMask: 1023,
      pattern: { id: "pattern-line", kind: "LINE" },
    },
  };
}

function createCandidate(
  cardId: string,
  reverseMasks = false,
): WinnerCandidate {
  const result = createWinnerCandidate({
    executionId: "execution-1",
    patternCandidate: patternCandidate(cardId, reverseMasks),
    decisiveDraw: DRAW,
  });
  if (!result.created) throw new Error(result.code);
  return result.candidate;
}

function validate(candidate: WinnerCandidate): ValidatedCandidate {
  const result = validateCandidate({
    candidate,
    policy: "SIMPLE",
    operatorActorId: "operator-1",
    validatorActorId: "operator-1",
    validatorAuthorized: true,
    action: "APPROVE",
    now: NOW,
  });
  if (!result.accepted) throw new Error(result.code);
  return result.result;
}

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  nextInt(maxExclusive: number): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state % maxExclusive;
  }
}

function shuffle<T>(values: readonly T[], random: SeededRandom): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = random.nextInt(index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}
