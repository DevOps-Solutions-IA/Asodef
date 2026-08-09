import type { PatternCandidate } from "../patterns";
import { createWinnerCandidate, WinnerCandidate } from "./candidate";
import {
  ExactPrizeValue,
  FrozenTieConfiguration,
  resolveTieOutcome,
} from "./tie-outcome";
import { validateCandidate, ValidatedCandidate } from "./validation";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const DRAW = {
  ball: 61,
  evidenceHash: "draw-evidence",
  id: "draw-5",
  sequence: 5,
};

function patternCandidate(
  cardId: string,
  executionId = "execution-1",
  reverseMasks = false,
): { executionId: string; patternCandidate: PatternCandidate } {
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
    executionId,
    patternCandidate: {
      cardId,
      cardLayoutHash: `layout-${cardId}`,
      evaluation: {
        decisiveBall: 61,
        decisiveDrawSequence: 5,
        evidence: {
          cardLayoutHash: `layout-${cardId}`,
          drawnBallMaskAtDecision: 31n,
          matchedPatternMasks: reverseMasks ? [...masks].reverse() : masks,
        },
        matched: true,
        matchedMask: 1023,
        pattern: { id: "pattern-line", kind: "LINE" },
      },
    },
  };
}

function candidate(
  cardId: string,
  executionId = "execution-1",
): WinnerCandidate {
  const result = createWinnerCandidate({
    ...patternCandidate(cardId, executionId),
    decisiveDraw: DRAW,
  });
  if (!result.created) throw new Error(result.code);
  return result.candidate;
}

function validate(
  value: WinnerCandidate,
  overrides: Partial<Parameters<typeof validateCandidate>[0]> = {},
): ValidatedCandidate {
  const result = validateCandidate({
    action: "APPROVE",
    candidate: value,
    now: NOW,
    operatorActorId: "operator-1",
    policy: "SIMPLE",
    validatorActorId: "operator-1",
    validatorAuthorized: true,
    ...overrides,
  });
  if (!result.accepted) throw new Error(result.code);
  return result.result;
}

const MONEY: ExactPrizeValue = {
  currency: "COP",
  kind: "MONEY",
  minorUnits: 10n,
};
const SPLIT: FrozenTieConfiguration = {
  configurationFrozen: true,
  policy: "SPLIT_PRIZE",
};

describe("Bingo candidate evidence", () => {
  it("turns a pattern match into a pending candidate with deterministic identity", () => {
    const first = createWinnerCandidate({
      ...patternCandidate("card-1"),
      decisiveDraw: DRAW,
    });
    const permutedEvidence = createWinnerCandidate({
      ...patternCandidate("card-1", "execution-1", true),
      decisiveDraw: { ...DRAW },
    });
    expect(first).toMatchObject({
      created: true,
      code: "CANDIDATE_CREATED",
      candidate: { status: "PENDING" },
    });
    expect(permutedEvidence).toMatchObject({
      created: true,
      candidate: {
        id: first.created ? first.candidate.id : "",
        fingerprint: first.created ? first.candidate.fingerprint : "",
      },
    });
  });

  it.each([
    [{ executionId: "" }, "INVALID_EXECUTION_REFERENCE"],
    [{ cardId: "" }, "INVALID_CARD_REFERENCE"],
    [{ matched: false }, "PATTERN_NOT_MATCHED"],
    [{ decisiveDrawSequence: 4 }, "DECISIVE_DRAW_MISMATCH"],
    [{ decisiveBall: 60 }, "DECISIVE_DRAW_MISMATCH"],
    [{ matchedMask: 0 }, "INVALID_PATTERN_EVIDENCE"],
  ] as const)("rejects candidate evidence mutation %#", (mutation, code) => {
    const base = patternCandidate("card-1");
    const result = createWinnerCandidate({
      decisiveDraw: DRAW,
      executionId:
        "executionId" in mutation ? mutation.executionId : base.executionId,
      patternCandidate: {
        ...base.patternCandidate,
        cardId:
          "cardId" in mutation ? mutation.cardId : base.patternCandidate.cardId,
        evaluation: {
          ...base.patternCandidate.evaluation,
          decisiveBall:
            "decisiveBall" in mutation
              ? mutation.decisiveBall
              : base.patternCandidate.evaluation.decisiveBall,
          decisiveDrawSequence:
            "decisiveDrawSequence" in mutation
              ? mutation.decisiveDrawSequence
              : base.patternCandidate.evaluation.decisiveDrawSequence,
          matched: "matched" in mutation ? mutation.matched : true,
          matchedMask:
            "matchedMask" in mutation
              ? mutation.matchedMask
              : base.patternCandidate.evaluation.matchedMask,
        },
      },
    });
    expect(result).toEqual({ created: false, code });
  });

  it("changes the fingerprint when material evidence changes", () => {
    const baseline = candidate("card-1");
    const otherCard = candidate("card-2");
    const otherExecution = candidate("card-1", "execution-2");
    expect(
      new Set([
        baseline.fingerprint,
        otherCard.fingerprint,
        otherExecution.fingerprint,
      ]).size,
    ).toBe(3);
  });
});

describe("Bingo candidate validation", () => {
  it("does not create a winner and permits an authorized SIMPLE actor", () => {
    const decision = validateCandidate({
      action: "APPROVE",
      candidate: candidate("card-1"),
      now: NOW,
      operatorActorId: "operator-1",
      policy: "SIMPLE",
      validatorActorId: "operator-1",
      validatorAuthorized: true,
    });
    expect(decision).toMatchObject({
      accepted: true,
      code: "CANDIDATE_VALIDATED",
      result: { status: "VALIDATED" },
    });
    expect(decision).not.toHaveProperty("winner");
  });

  it("enforces a distinct authorized actor for DUAL_CONTROL", () => {
    const value = candidate("card-1");
    expect(
      validateCandidate({
        action: "APPROVE",
        candidate: value,
        now: NOW,
        operatorActorId: "operator-1",
        policy: "DUAL_CONTROL",
        validatorActorId: "operator-1",
        validatorAuthorized: true,
      }),
    ).toEqual({ accepted: false, code: "DUAL_CONTROL_ACTOR_CONFLICT" });
    expect(
      validateCandidate({
        action: "APPROVE",
        candidate: value,
        now: NOW,
        operatorActorId: "operator-1",
        policy: "DUAL_CONTROL",
        validatorActorId: "supervisor-1",
        validatorAuthorized: true,
      }),
    ).toMatchObject({ accepted: true, code: "CANDIDATE_VALIDATED" });
  });

  it("requires permission and an explicit rejection reason", () => {
    const value = candidate("card-1");
    expect(
      validateCandidate({
        action: "APPROVE",
        candidate: value,
        now: NOW,
        operatorActorId: "operator-1",
        policy: "SIMPLE",
        validatorActorId: "user-1",
        validatorAuthorized: false,
      }),
    ).toEqual({ accepted: false, code: "VALIDATOR_NOT_AUTHORIZED" });
    expect(
      validateCandidate({
        action: "REJECT",
        candidate: value,
        now: NOW,
        operatorActorId: "operator-1",
        policy: "SIMPLE",
        rejectionReason: " ",
        validatorActorId: "user-1",
        validatorAuthorized: true,
      }),
    ).toEqual({ accepted: false, code: "REJECTION_REASON_REQUIRED" });
    expect(
      validateCandidate({
        action: "REJECT",
        candidate: value,
        now: NOW,
        operatorActorId: "operator-1",
        policy: "SIMPLE",
        rejectionReason: "Evidence does not support the pattern",
        validatorActorId: "user-1",
        validatorAuthorized: true,
      }),
    ).toMatchObject({
      accepted: true,
      code: "CANDIDATE_REJECTED",
      result: { status: "REJECTED" },
    });
  });
});

describe("Bingo exact tie outcomes", () => {
  const values = [
    candidate("card-c"),
    candidate("card-a"),
    candidate("card-b"),
  ].map((value) => validate(value));

  it("represents an exact rational split and retains indivisible minor units", () => {
    const result = resolveTieOutcome({
      candidates: values,
      prize: MONEY,
      prizeId: "prize-1",
      tie: SPLIT,
    });
    expect(result).toMatchObject({
      code: "WINNERS_RESOLVED",
      policy: "SPLIT_PRIZE",
      remainder: { currency: "COP", kind: "MONEY", minorUnits: 1n },
      remainderDisposition: "REQUIRES_PRECONFIGURED_RULE",
      resolved: true,
    });
    if (!result.resolved) throw new Error(result.code);
    expect(result.winners).toHaveLength(3);
    const allocations = result.winners.map((winner) =>
      winner.allocation.kind === "MONEY"
        ? winner.allocation.payableMinorUnits
        : 0n,
    );
    expect(allocations).toEqual([3n, 3n, 3n]);
    expect(
      result.winners.map((winner) => ({
        denominator: winner.allocation.exactShareDenominator,
        numerator: winner.allocation.exactShareNumerator,
      })),
    ).toEqual([
      { denominator: 3n, numerator: 10n },
      { denominator: 3n, numerator: 10n },
      { denominator: 3n, numerator: 10n },
    ]);
    expect(
      allocations.reduce((sum, value) => sum + value, 0n) +
        (result.remainder.kind === "MONEY" ? result.remainder.minorUnits : 0n),
    ).toBe(10n);
  });

  it("is invariant to candidate input order", () => {
    const forward = resolveTieOutcome({
      candidates: values,
      prize: MONEY,
      prizeId: "prize-1",
      tie: SPLIT,
    });
    const reversed = resolveTieOutcome({
      candidates: [...values].reverse(),
      prize: MONEY,
      prizeId: "prize-1",
      tie: SPLIT,
    });
    expect(reversed).toEqual(forward);
  });

  it("keeps arbitrary precision bigint amounts exact", () => {
    const huge = 9_007_199_254_740_993_000_000_007n;
    const result = resolveTieOutcome({
      candidates: values,
      prize: { currency: "COP", kind: "MONEY", minorUnits: huge },
      prizeId: "huge-prize",
      tie: SPLIT,
    });
    if (!result.resolved) throw new Error(result.code);
    const allocated = result.winners.reduce(
      (sum, winner) =>
        sum +
        (winner.allocation.kind === "MONEY"
          ? winner.allocation.payableMinorUnits
          : 0n),
      0n,
    );
    const retainedRemainder =
      result.remainder.kind === "MONEY" ? result.remainder.minorUnits : 0n;
    expect(allocated + retainedRemainder).toBe(huge);
    expect(
      result.winners.every(
        (winner) =>
          winner.allocation.exactShareNumerator === huge &&
          winner.allocation.exactShareDenominator === 3n,
      ),
    ).toBe(true);
  });

  it("applies the same exact split semantics to non-monetary units", () => {
    const result = resolveTieOutcome({
      candidates: values,
      prize: { kind: "UNITS", unitCode: "TICKET", units: 8n },
      prizeId: "unit-prize",
      tie: SPLIT,
    });
    if (!result.resolved) throw new Error(result.code);
    expect(result.winners).toHaveLength(3);
    expect(
      result.winners.map((winner) =>
        winner.allocation.kind === "UNITS"
          ? {
              denominator: winner.allocation.exactShareDenominator,
              numerator: winner.allocation.exactShareNumerator,
              payable: winner.allocation.payableUnits,
            }
          : undefined,
      ),
    ).toEqual([
      { denominator: 3n, numerator: 8n, payable: 2n },
      { denominator: 3n, numerator: 8n, payable: 2n },
      { denominator: 3n, numerator: 8n, payable: 2n },
    ]);
    expect(result.remainder).toEqual({
      kind: "UNITS",
      unitCode: "TICKET",
      units: 2n,
    });
    expect(result.remainderDisposition).toBe("REQUIRES_PRECONFIGURED_RULE");
  });

  it("grants the complete prize to every simultaneous winner under FULL_PRIZE_EACH", () => {
    const result = resolveTieOutcome({
      candidates: values,
      prize: MONEY,
      prizeId: "prize-1",
      tie: { configurationFrozen: true, policy: "FULL_PRIZE_EACH" },
    });
    if (!result.resolved) throw new Error(result.code);
    expect(result.winners).toHaveLength(3);
    expect(
      result.winners.map((winner) =>
        winner.allocation.kind === "MONEY"
          ? winner.allocation.payableMinorUnits
          : 0n,
      ),
    ).toEqual([10n, 10n, 10n]);
  });

  it("preserves every candidate in declarative tie-break context", () => {
    const result = resolveTieOutcome({
      candidates: [...values].reverse(),
      prize: MONEY,
      prizeId: "prize-1",
      tie: { configurationFrozen: true, policy: "TIE_BREAK" },
    });
    expect(result).toMatchObject({
      code: "TIE_BREAK_REQUIRED",
      executionId: "execution-1",
      prizeId: "prize-1",
      resolved: false,
    });
    if (result.resolved || !("candidateIds" in result))
      throw new Error(result.code);
    expect(result.candidateIds).toHaveLength(3);
  });

  it("returns a preconfigured special rule as inert data and never evaluates it", () => {
    const marker = { called: false };
    const ruleId = "globalThis.marker.called=true";
    const result = resolveTieOutcome({
      candidates: values,
      prize: MONEY,
      prizeId: "prize-1",
      tie: {
        configurationFrozen: true,
        policy: "PRECONFIGURED_SPECIAL_RULE",
        specialRuleId: ruleId,
      },
    });
    expect(result).toMatchObject({
      code: "SPECIAL_RULE_REQUIRED",
      resolved: false,
      specialRuleId: ruleId,
    });
    expect(marker.called).toBe(false);
  });

  it.each([
    [
      { configurationFrozen: false, policy: "SPLIT_PRIZE" },
      "TIE_CONFIGURATION_NOT_FROZEN",
    ],
    [
      { configurationFrozen: true, policy: "PRECONFIGURED_SPECIAL_RULE" },
      "SPECIAL_RULE_ID_REQUIRED",
    ],
  ] as const)("rejects tie configuration mutation %#", (tie, code) => {
    expect(
      resolveTieOutcome({
        candidates: values,
        prize: MONEY,
        prizeId: "prize-1",
        tie,
      }),
    ).toEqual({ resolved: false, code });
  });

  it("rejects duplicate candidates, mixed executions and rejected-only input", () => {
    expect(
      resolveTieOutcome({
        candidates: [values[0]!, values[0]!],
        prize: MONEY,
        prizeId: "prize-1",
        tie: SPLIT,
      }),
    ).toEqual({ resolved: false, code: "DUPLICATE_CANDIDATE" });
    expect(
      resolveTieOutcome({
        candidates: [values[0]!, validate(candidate("other", "execution-2"))],
        prize: MONEY,
        prizeId: "prize-1",
        tie: SPLIT,
      }),
    ).toEqual({ resolved: false, code: "MIXED_EXECUTIONS" });
    const laterBase = patternCandidate("later-card");
    const laterDecision = createWinnerCandidate({
      decisiveDraw: {
        ball: 62,
        evidenceHash: "draw-6-evidence",
        id: "draw-6",
        sequence: 6,
      },
      executionId: laterBase.executionId,
      patternCandidate: {
        ...laterBase.patternCandidate,
        evaluation: {
          ...laterBase.patternCandidate.evaluation,
          decisiveBall: 62,
          decisiveDrawSequence: 6,
        },
      },
    });
    if (!laterDecision.created) throw new Error(laterDecision.code);
    expect(
      resolveTieOutcome({
        candidates: [values[0]!, validate(laterDecision.candidate)],
        prize: MONEY,
        prizeId: "prize-1",
        tie: SPLIT,
      }),
    ).toEqual({ resolved: false, code: "NON_SIMULTANEOUS_CANDIDATES" });
    const rejected = validate(candidate("rejected"), {
      action: "REJECT",
      rejectionReason: "Invalid evidence",
    });
    expect(
      resolveTieOutcome({
        candidates: [rejected],
        prize: MONEY,
        prizeId: "prize-1",
        tie: SPLIT,
      }),
    ).toEqual({ resolved: false, code: "NO_VALIDATED_CANDIDATES" });
  });
});
