import { createCanonicalCard } from "../cards";
import {
  ALL_POSITIONS_MASK,
  DIAGONAL_LINE_MASKS,
  FOUR_CORNERS_MASK,
  HORIZONTAL_LINE_MASKS,
  VERTICAL_LINE_MASKS,
  positionMask,
} from "./pattern-definition";
import { BINGO_PATTERN_ERROR_CODES } from "./pattern-errors";
import { evaluatePattern, evaluatePatternBatch } from "./pattern-evaluator";
import type {
  BingoDrawValue,
  BingoPatternDefinition,
  BingoPatternKind,
} from "./pattern-types";

describe("deterministic Bingo pattern evaluation", () => {
  it.each([
    ["horizontal", HORIZONTAL_LINE_MASKS[0]!, [1, 16, 31, 46, 61]],
    ["vertical", VERTICAL_LINE_MASKS[0]!, [1, 2, 3, 4, 5]],
    ["diagonal", DIAGONAL_LINE_MASKS[0]!, [1, 17, 49, 65]],
  ] as const)(
    "matches only the explicitly configured %s LINE",
    (_, mask, balls) => {
      const pattern = definition("LINE", 1, mask);
      const result = evaluatePattern(CARD, draws(...balls), pattern);

      expect(result).toMatchObject({
        decisiveBall: balls.at(-1),
        decisiveDrawSequence: balls.length,
        matched: true,
        matchedMask: mask,
      });
      expect(result.evidence.matchedPatternMasks).toHaveLength(1);
    },
  );

  it("does not infer an orientation that was not configured", () => {
    const horizontalOnly = definition("LINE", 1, HORIZONTAL_LINE_MASKS[0]!);

    expect(
      evaluatePattern(CARD, draws(1, 2, 3, 4, 5), horizontalOnly).matched,
    ).toBe(false);
  });

  it("requires exactly two configured line masks for TWO_LINES", () => {
    const pattern = definition(
      "TWO_LINES",
      2,
      HORIZONTAL_LINE_MASKS[0]!,
      VERTICAL_LINE_MASKS[0]!,
    );
    const result = evaluatePattern(
      CARD,
      draws(1, 16, 31, 46, 61, 2, 3, 4, 5),
      pattern,
    );

    expect(result.matched).toBe(true);
    expect(result.decisiveBall).toBe(5);
    expect(result.decisiveDrawSequence).toBe(9);
    expect(result.evidence.matchedPatternMasks.map((mask) => mask.id)).toEqual([
      "mask-1",
      "mask-2",
    ]);
  });

  it("evaluates FOUR_CORNERS without involving FREE", () => {
    const result = evaluatePattern(
      CARD,
      draws(1, 61, 5, 65),
      definition("FOUR_CORNERS", 1, FOUR_CORNERS_MASK),
    );

    expect(result).toMatchObject({ matched: true, decisiveBall: 65 });
    expect(result.evidence.matchedPatternMasks[0]!.requiredBallMask).not.toBe(
      0n,
    );
  });

  it("evaluates FULL_CARD with FREE satisfied from the start", () => {
    const playableBalls = CARD.numbers.filter((ball) => ball !== 0);
    const result = evaluatePattern(
      CARD,
      draws(...playableBalls),
      definition("FULL_CARD", 1, ALL_POSITIONS_MASK),
    );

    expect(result.matched).toBe(true);
    expect(result.decisiveDrawSequence).toBe(24);
    expect(result.evidence.matchedPatternMasks[0]!.requiredBallMask).toBe(
      CARD.numberMask,
    );
  });

  it("evaluates validated CUSTOM masks with FREE semantics", () => {
    const custom = positionMask(0, 6, 12, 18);
    const result = evaluatePattern(
      CARD,
      draws(1, 17, 49),
      definition("CUSTOM", 1, custom),
    );

    expect(result).toMatchObject({
      matched: true,
      decisiveBall: 49,
      matchedMask: custom,
    });
  });

  it("identifies the first satisfying draw and preserves monotonicity", () => {
    const pattern = definition("LINE", 1, HORIZONTAL_LINE_MASKS[0]!);
    const before = evaluatePattern(CARD, draws(1, 16, 31, 46), pattern);
    const atMatch = evaluatePattern(CARD, draws(1, 16, 31, 46, 61), pattern);
    const after = evaluatePattern(
      CARD,
      draws(1, 16, 31, 46, 61, 75, 60),
      pattern,
    );

    expect(before.matched).toBe(false);
    expect(atMatch).toMatchObject({
      matched: true,
      decisiveBall: 61,
      decisiveDrawSequence: 5,
    });
    expect(after).toMatchObject({
      matched: true,
      decisiveBall: 61,
      decisiveDrawSequence: 5,
    });
  });

  it("makes final satisfaction set-based while sequence controls the decisive ball", () => {
    const pattern = definition("LINE", 1, HORIZONTAL_LINE_MASKS[0]!);
    const forward = evaluatePattern(CARD, draws(1, 16, 31, 46, 61), pattern);
    const reverse = evaluatePattern(CARD, draws(61, 46, 31, 16, 1), pattern);
    const shuffledInput = evaluatePattern(
      CARD,
      [...draws(1, 16, 31, 46, 61)].reverse(),
      pattern,
    );

    expect(forward.matched).toBe(true);
    expect(reverse.matched).toBe(true);
    expect(forward.decisiveBall).toBe(61);
    expect(reverse.decisiveBall).toBe(1);
    expect(shuffledInput).toEqual(forward);
  });

  it("returns every simultaneous candidate independently of card input order", () => {
    const pattern = definition("LINE", 1, HORIZONTAL_LINE_MASKS[0]!);
    const cards = [
      { card: SECOND_CARD, cardId: "card-b" },
      { card: CARD, cardId: "card-a" },
    ];
    const drawSequence = draws(1, 16, 31, 46, 61);
    const first = evaluatePatternBatch(cards, drawSequence, pattern);
    const permuted = evaluatePatternBatch(
      [...cards].reverse(),
      drawSequence,
      pattern,
    );

    expect(first.map((candidate) => candidate.cardId)).toEqual([
      "card-a",
      "card-b",
    ]);
    expect(first.map((candidate) => candidate.evaluation.decisiveBall)).toEqual(
      [61, 61],
    );
    expect(first).toEqual(permuted);
  });

  it("keeps optimized batch results equivalent to individual evaluation", () => {
    const pattern = definition(
      "TWO_LINES",
      2,
      HORIZONTAL_LINE_MASKS[0]!,
      VERTICAL_LINE_MASKS[0]!,
    );
    const drawSequence = draws(1, 16, 31, 46, 61, 2, 3, 4, 5);
    const batch = evaluatePatternBatch(
      [{ card: CARD, cardId: "card-a" }],
      drawSequence,
      pattern,
    );

    expect(batch[0]!.evaluation).toEqual(
      evaluatePattern(CARD, drawSequence, pattern),
    );
  });

  it("evaluates a deterministic batch of 50,000 cards without dropping matches", () => {
    const cards = Array.from({ length: 50_000 }, (_, index) => ({
      card: CARD,
      cardId: `card-${String(index).padStart(5, "0")}`,
    }));
    const candidates = evaluatePatternBatch(
      cards,
      draws(1, 16, 31, 46, 61),
      definition("LINE", 1, HORIZONTAL_LINE_MASKS[0]!),
    );

    expect(candidates).toHaveLength(50_000);
    expect(candidates[0]!.cardId).toBe("card-00000");
    expect(candidates.at(-1)!.cardId).toBe("card-49999");
    expect(
      candidates.every((candidate) => candidate.evaluation.decisiveBall === 61),
    ).toBe(true);
  }, 30_000);

  it.each([
    ["zero sequence", [{ ball: 1, sequence: 0 }]],
    ["ball below range", [{ ball: 0, sequence: 1 }]],
    ["ball above range", [{ ball: 76, sequence: 1 }]],
    [
      "duplicate sequence",
      [
        { ball: 1, sequence: 1 },
        { ball: 2, sequence: 1 },
      ],
    ],
    [
      "duplicate ball",
      [
        { ball: 1, sequence: 1 },
        { ball: 1, sequence: 2 },
      ],
    ],
  ] satisfies readonly (readonly [string, readonly BingoDrawValue[]])[])(
    "rejects ambiguous or invalid draw evidence: %s",
    (_, invalidDraws) => {
      expect(() =>
        evaluatePattern(
          CARD,
          invalidDraws,
          definition("CUSTOM", 1, positionMask(0)),
        ),
      ).toThrow(
        expect.objectContaining({
          code: BINGO_PATTERN_ERROR_CODES.INVALID_DRAW_SEQUENCE,
        }),
      );
    },
  );

  it("rejects duplicate card references instead of hiding candidates", () => {
    expect(() =>
      evaluatePatternBatch(
        [
          { card: CARD, cardId: "same" },
          { card: SECOND_CARD, cardId: "same" },
        ],
        draws(1),
        definition("CUSTOM", 1, positionMask(0)),
      ),
    ).toThrow(
      expect.objectContaining({
        code: BINGO_PATTERN_ERROR_CODES.DUPLICATE_CARD_REFERENCE,
      }),
    );
  });
});

const CARD = createCanonicalCard([
  1, 16, 31, 46, 61, 2, 17, 32, 47, 62, 3, 18, 0, 48, 63, 4, 19, 33, 49, 64, 5,
  20, 34, 50, 65,
]);
const SECOND_CARD = createCanonicalCard([
  1, 16, 31, 46, 61, 5, 20, 34, 50, 65, 4, 19, 0, 49, 64, 3, 18, 33, 48, 63, 2,
  17, 32, 47, 62,
]);

function definition(
  kind: BingoPatternKind,
  requiredMatchCount: number,
  ...masks: readonly number[]
): BingoPatternDefinition {
  return {
    configurationFrozen: true,
    id: `pattern-${kind}`,
    kind,
    masks: masks.map((mask, index) => ({
      id: `mask-${index + 1}`,
      positionMask: mask,
      sequence: index + 1,
    })),
    requiredMatchCount,
  };
}

function draws(...balls: readonly number[]): readonly BingoDrawValue[] {
  return balls.map((ball, index) => ({ ball, sequence: index + 1 }));
}
