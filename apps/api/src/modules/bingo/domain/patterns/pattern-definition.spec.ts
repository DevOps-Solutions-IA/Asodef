import { createCanonicalCard } from "../cards";
import {
  ALL_POSITIONS_MASK,
  DIAGONAL_LINE_MASKS,
  FOUR_CORNERS_MASK,
  FREE_POSITION_MASK,
  HORIZONTAL_LINE_MASKS,
  PLAYABLE_POSITIONS_MASK,
  VERTICAL_LINE_MASKS,
  positionMask,
  positionsFromMask,
  validatePatternDefinition,
} from "./pattern-definition";
import { BINGO_PATTERN_ERROR_CODES } from "./pattern-errors";
import { evaluatePattern } from "./pattern-evaluator";
import type { BingoPatternDefinition } from "./pattern-types";

describe("Bingo pattern definitions", () => {
  it("provides explicit horizontal, vertical and diagonal line masks", () => {
    expect(HORIZONTAL_LINE_MASKS).toHaveLength(5);
    expect(VERTICAL_LINE_MASKS).toHaveLength(5);
    expect(DIAGONAL_LINE_MASKS).toHaveLength(2);
    expect(
      new Set([
        ...HORIZONTAL_LINE_MASKS,
        ...VERTICAL_LINE_MASKS,
        ...DIAGONAL_LINE_MASKS,
      ]).size,
    ).toBe(12);
    expect(positionsFromMask(HORIZONTAL_LINE_MASKS[0]!)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(positionsFromMask(VERTICAL_LINE_MASKS[0]!)).toEqual([
      0, 5, 10, 15, 20,
    ]);
    expect(positionsFromMask(DIAGONAL_LINE_MASKS[0]!)).toEqual([
      0, 6, 12, 18, 24,
    ]);
  });

  it.each([
    [
      "LINE",
      1,
      [{ id: "row", sequence: 1, positionMask: HORIZONTAL_LINE_MASKS[0]! }],
    ],
    [
      "TWO_LINES",
      2,
      [
        { id: "row", sequence: 1, positionMask: HORIZONTAL_LINE_MASKS[0]! },
        { id: "column", sequence: 2, positionMask: VERTICAL_LINE_MASKS[0]! },
      ],
    ],
    [
      "FOUR_CORNERS",
      1,
      [{ id: "corners", sequence: 1, positionMask: FOUR_CORNERS_MASK }],
    ],
    [
      "FULL_CARD",
      1,
      [{ id: "full", sequence: 1, positionMask: ALL_POSITIONS_MASK }],
    ],
    [
      "FULL_CARD",
      1,
      [{ id: "playable", sequence: 1, positionMask: PLAYABLE_POSITIONS_MASK }],
    ],
    [
      "CUSTOM",
      1,
      [{ id: "custom", sequence: 1, positionMask: positionMask(0, 6, 12, 18) }],
    ],
  ] as const)(
    "accepts an explicit valid %s definition",
    (kind, requiredMatchCount, masks) => {
      expect(() =>
        validatePatternDefinition({
          configurationFrozen: true,
          id: `pattern-${kind}`,
          kind,
          masks,
          requiredMatchCount,
        }),
      ).not.toThrow();
    },
  );

  it.each([
    ["empty", () => positionMask()],
    ["negative position", () => positionMask(-1)],
    ["position outside layout", () => positionMask(25)],
    ["FREE-only", () => validatePatternDefinition(custom(FREE_POSITION_MASK))],
  ])("rejects an invalid mask: %s", (_, operation) => {
    expect(operation).toThrow(
      expect.objectContaining({ code: BINGO_PATTERN_ERROR_CODES.INVALID_MASK }),
    );
  });

  it("rejects arbitrary shapes disguised as LINE", () => {
    const pattern: BingoPatternDefinition = {
      configurationFrozen: true,
      id: "bad-line",
      kind: "LINE",
      masks: [
        {
          id: "zigzag",
          sequence: 1,
          positionMask: positionMask(0, 1, 7, 8, 14),
        },
      ],
      requiredMatchCount: 1,
    };

    expect(() => validatePatternDefinition(pattern)).toThrow(
      expect.objectContaining({
        code: BINGO_PATTERN_ERROR_CODES.INVALID_PATTERN,
      }),
    );
  });

  it("rejects duplicate masks, duplicate sequences and invalid match counts", () => {
    const duplicateSequence: BingoPatternDefinition = {
      configurationFrozen: true,
      id: "duplicate-sequence",
      kind: "CUSTOM",
      masks: [
        { id: "a", sequence: 1, positionMask: positionMask(0) },
        { id: "b", sequence: 1, positionMask: positionMask(1) },
      ],
      requiredMatchCount: 1,
    };
    const duplicateMask: BingoPatternDefinition = {
      ...duplicateSequence,
      id: "duplicate-mask",
      masks: [
        { id: "a", sequence: 1, positionMask: positionMask(0) },
        { id: "b", sequence: 2, positionMask: positionMask(0) },
      ],
    };
    const impossibleCount: BingoPatternDefinition = {
      ...custom(positionMask(0)),
      requiredMatchCount: 2,
    };

    for (const pattern of [duplicateSequence, duplicateMask, impossibleCount]) {
      expect(() => validatePatternDefinition(pattern)).toThrow(
        expect.objectContaining({
          code: BINGO_PATTERN_ERROR_CODES.INVALID_PATTERN,
        }),
      );
    }
  });

  it("requires configuration freeze before evaluation", () => {
    const pattern = { ...custom(positionMask(0)), configurationFrozen: false };

    expect(() => evaluatePattern(CARD, draws(1), pattern)).toThrow(
      expect.objectContaining({
        code: BINGO_PATTERN_ERROR_CODES.CONFIGURATION_NOT_FROZEN,
      }),
    );
  });
});

const CARD = createCanonicalCard([
  1, 16, 31, 46, 61, 2, 17, 32, 47, 62, 3, 18, 0, 48, 63, 4, 19, 33, 49, 64, 5,
  20, 34, 50, 65,
]);

function custom(mask: number): BingoPatternDefinition {
  return {
    configurationFrozen: true,
    id: "custom",
    kind: "CUSTOM",
    masks: [{ id: "mask", positionMask: mask, sequence: 1 }],
    requiredMatchCount: 1,
  };
}

function draws(...balls: readonly number[]) {
  return balls.map((ball, index) => ({ ball, sequence: index + 1 }));
}
