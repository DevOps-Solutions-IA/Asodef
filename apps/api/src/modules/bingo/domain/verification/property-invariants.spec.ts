import {
  BINGO_FREE_INDEX,
  BingoCardGenerator,
  calculateLayoutHash,
  createNumberMask,
  hasBall,
} from "../cards";
import {
  ALL_POSITIONS_MASK,
  FOUR_CORNERS_MASK,
  HORIZONTAL_LINE_MASKS,
  VERTICAL_LINE_MASKS,
  evaluatePattern,
  evaluatePatternBatch,
  positionMask,
  type BingoDrawValue,
  type BingoPatternDefinition,
} from "../patterns";
import { CryptoRandomSource, type RandomSource } from "../random";
import {
  BINGO_EVENT_STATUSES,
  BINGO_EXECUTION_STATUSES,
  BINGO_ROUND_STATUSES,
  BingoLifecycleErrorCode,
  evaluateEventConfigurationChange,
  evaluateEventTransition,
  evaluateExecutionTransition,
  evaluateRoundTransition,
} from "../lifecycle";
import {
  canAssignCard,
  evaluateEligibility,
  type Participant,
} from "../participation";

describe("Bingo domain deterministic properties", () => {
  it("preserves every canonical card invariant across thousands of generated layouts", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const cards = new BingoCardGenerator(
        new SeededRandomSource(seed),
      ).generateUnique(500);
      expect(new Set(cards.map((card) => card.layoutHash)).size).toBe(
        cards.length,
      );

      expect(
        cards.every(
          (card) =>
            card.numbers.length === 25 &&
            card.numbers[BINGO_FREE_INDEX] === 0 &&
            new Set(card.numbers).size === 25 &&
            card.numberMask === createNumberMask(card.numbers) &&
            card.layoutHash === calculateLayoutHash(card.numbers) &&
            countBits(card.numberMask) === 24 &&
            card.numbers.every((ball) =>
              ball === 0
                ? !hasBall(card.numberMask, ball)
                : hasBall(card.numberMask, ball),
            ) &&
            hasValidColumnRanges(card.numbers),
        ),
      ).toBe(true);
    }
  });

  it("is monotonic for A subset B across every supported pattern kind", () => {
    const random = new SeededRandomSource(0x4d4f4e4f);
    const cards = new BingoCardGenerator(random).generateUnique(200);
    const patterns = supportedPatterns();

    for (const card of cards) {
      const shuffledBalls = shuffle(
        Array.from({ length: 75 }, (_, index) => index + 1),
        random,
      );
      const prefix = 20 + random.nextInt(40);
      const subset = shuffledBalls.slice(0, prefix);
      const superset = shuffledBalls.slice(
        0,
        prefix + random.nextInt(76 - prefix),
      );

      for (const pattern of patterns) {
        const withA = evaluatePattern(card, draws(subset), pattern);
        const withB = evaluatePattern(card, draws(superset), pattern);
        if (withA.matched) expect(withB.matched).toBe(true);
      }
    }
  });

  it("keeps final satisfaction set-based while sequence alone controls decisive evidence", () => {
    const random = new SeededRandomSource(0x0d3c151e);
    const cards = new BingoCardGenerator(random).generateUnique(250);
    const pattern = patternDefinition("CUSTOM", 1, positionMask(0, 1, 2, 3, 4));

    for (const card of cards) {
      const required = card.numbers.slice(0, 5);
      const forward = evaluatePattern(card, draws(required), pattern);
      const reverse = evaluatePattern(
        card,
        draws([...required].reverse()),
        pattern,
      );
      expect(forward.matched).toBe(true);
      expect(reverse.matched).toBe(true);
      expect(forward.matchedPositionMask).toBe(
        reverse.matchedPositionMask,
      );
      expect(forward.decisiveBall).toBe(required.at(-1));
      expect(reverse.decisiveBall).toBe(required[0]);
    }
  });

  it("returns the same complete candidate set for deterministic card permutations", () => {
    const random = new SeededRandomSource(0x71e5);
    const cards = new BingoCardGenerator(random)
      .generateUnique(500)
      .map((card, index) => ({
        card,
        cardId: `card-${String(index).padStart(4, "0")}`,
      }));
    const pattern = patternDefinition("LINE", 1, HORIZONTAL_LINE_MASKS[0]!);
    const drawSequence = draws(
      Array.from({ length: 75 }, (_, index) => index + 1),
    );
    const expected = evaluatePatternBatch(cards, drawSequence, pattern).map(
      ({ cardId }) => cardId,
    );

    for (let permutation = 0; permutation < 25; permutation += 1) {
      const actual = evaluatePatternBatch(
        shuffle(cards, random),
        drawSequence,
        pattern,
      ).map(({ cardId }) => cardId);
      expect(actual).toEqual(expected);
    }
  });
});

describe("Bingo domain mutation-directed guards", () => {
  it("never consults Math.random through the production CSPRNG adapter", () => {
    const spy = jest.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden");
    });
    try {
      expect(
        new BingoCardGenerator(new CryptoRandomSource()).generate(),
      ).toBeDefined();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("exhaustively rejects every transition outside the approved matrices", () => {
    const eventAllowed = new Set([
      "DRAFT:CONFIGURED",
      "DRAFT:CANCELLED",
      "CONFIGURED:PUBLISHED",
      "CONFIGURED:CANCELLED",
      "PUBLISHED:IN_PROGRESS",
      "PUBLISHED:CANCELLED",
      "IN_PROGRESS:COMPLETED",
      "IN_PROGRESS:CANCELLED",
      "COMPLETED:ARCHIVED",
    ]);
    const roundAllowed = new Set([
      "DRAFT:READY",
      "DRAFT:CANCELLED",
      "READY:IN_PROGRESS",
      "READY:CANCELLED",
      "IN_PROGRESS:COMPLETED",
      "IN_PROGRESS:CANCELLED",
    ]);
    const executionAllowed = new Set([
      "PLANNED:RUNNING",
      "RUNNING:PAUSED",
      "RUNNING:COMPLETED",
      "PAUSED:RUNNING",
    ]);

    for (const from of BINGO_EVENT_STATUSES) {
      for (const to of BINGO_EVENT_STATUSES) {
        expect(evaluateEventTransition(from, to).allowed).toBe(
          eventAllowed.has(`${from}:${to}`),
        );
      }
    }
    for (const from of BINGO_ROUND_STATUSES) {
      for (const to of BINGO_ROUND_STATUSES) {
        expect(evaluateRoundTransition(from, to).allowed).toBe(
          roundAllowed.has(`${from}:${to}`),
        );
      }
    }
    for (const from of BINGO_EXECUTION_STATUSES) {
      for (const to of BINGO_EXECUTION_STATUSES) {
        const expected =
          to !== "CANCELLED" && executionAllowed.has(`${from}:${to}`);
        expect(evaluateExecutionTransition(from, to).allowed).toBe(expected);
      }
    }
    expect(evaluateExecutionTransition("COMPLETED", "RUNNING")).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.INVALID_STATE_TRANSITION,
    });
  });

  it("rejects changes to frozen critical configuration", () => {
    expect(
      evaluateEventConfigurationChange("PUBLISHED", new Date(0), {
        before: { fairnessMode: "CRYPTO_RNG", maxCardsPerParticipant: 1 },
        after: {
          fairnessMode: "CRYPTO_RNG_COMMIT_REVEAL",
          maxCardsPerParticipant: 2,
        },
        lockedFields: ["fairnessMode", "maxCardsPerParticipant"],
      }),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.EVENT_CONFIGURATION_LOCKED,
    });
  });

  it("rejects an inactive affiliate even when the policy allows affiliates", () => {
    expect(
      evaluateEligibility({
        eventId: "event-1",
        policy: "AFFILIATES",
        identity: {
          kind: "AFFILIATE",
          subjectKey: "subject-1",
          affiliateId: "affiliate-1",
          affiliateStatus: "INACTIVE",
        },
        allowedPartnerCompanyIds: [],
        now: new Date("2026-08-09T00:00:00.000Z"),
      }),
    ).toMatchObject({
      eligible: false,
      code: "IDENTITY_INVALID",
      identityCode: "AFFILIATE_NOT_ACTIVE",
    });
  });

  it("rejects assignment exactly at the configured card limit", () => {
    const participant: Participant = {
      id: "participant-1",
      eventId: "event-1",
      subjectKey: "subject-1",
      identityKind: "AFFILIATE",
      status: "APPROVED",
      eligibilityCode: "ELIGIBLE",
      approvedAt: new Date("2026-08-08T00:00:00.000Z"),
    };
    expect(
      canAssignCard({
        eventId: "event-1",
        participant,
        cardEventId: "event-1",
        cardHasActiveAssignment: false,
        participantActiveCardCount: 3,
        maxCardsPerParticipant: 3,
        eventStatus: "PUBLISHED",
        roundStatus: "READY",
        now: new Date("2026-08-09T00:00:00.000Z"),
      }),
    ).toEqual({ allowed: false, code: "CARD_LIMIT_REACHED" });
  });
});

class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0)
      throw new RangeError();
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / maxExclusive) * maxExclusive;
    let value: number;
    do value = this.nextUint32();
    while (value >= limit);
    return value % maxExclusive;
  }

  private nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}

function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = random.nextInt(index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function draws(balls: readonly number[]): readonly BingoDrawValue[] {
  return balls.map((ball, index) => ({ ball, sequence: index + 1 }));
}

function patternDefinition(
  kind: BingoPatternDefinition["kind"],
  requiredMatchCount: number,
  ...masks: readonly number[]
): BingoPatternDefinition {
  return {
    id: `verification-${kind}`,
    kind,
    requiredMatchCount,
    configurationFrozen: true,
    masks: masks.map((positionMaskValue, index) => ({
      id: `mask-${index + 1}`,
      sequence: index + 1,
      positionMask: positionMaskValue,
    })),
  };
}

function supportedPatterns(): readonly BingoPatternDefinition[] {
  return [
    patternDefinition("LINE", 1, ...HORIZONTAL_LINE_MASKS),
    patternDefinition(
      "TWO_LINES",
      2,
      ...HORIZONTAL_LINE_MASKS,
      ...VERTICAL_LINE_MASKS,
    ),
    patternDefinition("FOUR_CORNERS", 1, FOUR_CORNERS_MASK),
    patternDefinition("FULL_CARD", 1, ALL_POSITIONS_MASK),
    patternDefinition("CUSTOM", 1, positionMask(0, 6, 12, 18, 24)),
  ];
}

function countBits(mask: bigint): number {
  let value = mask;
  let count = 0;
  while (value !== 0n) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function hasValidColumnRanges(numbers: readonly number[]): boolean {
  const ranges = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ] as const;
  for (let index = 0; index < numbers.length; index += 1) {
    if (index === BINGO_FREE_INDEX) continue;
    const [minimum, maximum] = ranges[index % 5]!;
    const value = numbers[index]!;
    if (value < minimum || value > maximum) return false;
  }
  return true;
}
