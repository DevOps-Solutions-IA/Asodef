import { BINGO_FREE_INDEX, BINGO_CARD_SIZE } from "../cards";
import {
  BINGO_PATTERN_ERROR_CODES,
  BingoPatternDomainError,
} from "./pattern-errors";
import type {
  BingoPatternDefinition,
  BingoPositionMask,
} from "./pattern-types";

export const ALL_POSITIONS_MASK = 2 ** BINGO_CARD_SIZE - 1;
export const FREE_POSITION_MASK = 2 ** BINGO_FREE_INDEX;
export const PLAYABLE_POSITIONS_MASK = ALL_POSITIONS_MASK ^ FREE_POSITION_MASK;
export const FOUR_CORNERS_MASK = positionMask(0, 4, 20, 24);

export const HORIZONTAL_LINE_MASKS = Object.freeze(
  Array.from({ length: 5 }, (_, row) =>
    positionMask(
      ...Array.from({ length: 5 }, (__, column) => row * 5 + column),
    ),
  ),
);
export const VERTICAL_LINE_MASKS = Object.freeze(
  Array.from({ length: 5 }, (_, column) =>
    positionMask(...Array.from({ length: 5 }, (__, row) => row * 5 + column)),
  ),
);
export const DIAGONAL_LINE_MASKS = Object.freeze([
  positionMask(0, 6, 12, 18, 24),
  positionMask(4, 8, 12, 16, 20),
]);
export const VALID_LINE_MASKS = new Set<number>([
  ...HORIZONTAL_LINE_MASKS,
  ...VERTICAL_LINE_MASKS,
  ...DIAGONAL_LINE_MASKS,
]);

export function positionMask(...positions: readonly number[]): number {
  if (positions.length === 0) {
    invalidMask("A pattern mask cannot be empty");
  }

  let mask = 0;
  for (const position of positions) {
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position >= BINGO_CARD_SIZE
    ) {
      invalidMask("A pattern position must be an integer between 0 and 24", {
        position,
      });
    }
    mask |= 2 ** position;
  }
  return mask;
}

export function positionsFromMask(mask: number): readonly number[] {
  validateRawMask(mask);
  const positions: number[] = [];
  for (let position = 0; position < BINGO_CARD_SIZE; position += 1) {
    if ((mask & (2 ** position)) !== 0) positions.push(position);
  }
  return positions;
}

export function validatePatternDefinition(
  pattern: BingoPatternDefinition,
  options: { readonly requireFrozen?: boolean } = {},
): void {
  if (options.requireFrozen !== false && !pattern.configurationFrozen) {
    throw new BingoPatternDomainError(
      BINGO_PATTERN_ERROR_CODES.CONFIGURATION_NOT_FROZEN,
      "Pattern evaluation requires a frozen round configuration",
      { patternId: pattern.id },
    );
  }
  if (pattern.id.trim().length === 0) {
    invalidPattern("A pattern id is required");
  }
  if (!Number.isInteger(pattern.requiredMatchCount)) {
    invalidPattern("requiredMatchCount must be an integer");
  }
  if (pattern.masks.length === 0) {
    invalidPattern("A pattern must contain at least one explicit mask");
  }

  const sequences = new Set<number>();
  const positionMasks = new Set<number>();
  for (const mask of pattern.masks) {
    validateMask(mask);
    if (sequences.has(mask.sequence)) {
      invalidPattern("Pattern mask sequences must be unique", {
        sequence: mask.sequence,
      });
    }
    if (positionMasks.has(mask.positionMask)) {
      invalidPattern("Duplicate position masks are not allowed", {
        positionMask: mask.positionMask,
      });
    }
    sequences.add(mask.sequence);
    positionMasks.add(mask.positionMask);
  }

  if (
    pattern.requiredMatchCount <= 0 ||
    pattern.requiredMatchCount > pattern.masks.length
  ) {
    invalidPattern(
      "requiredMatchCount must be within the configured mask count",
    );
  }

  switch (pattern.kind) {
    case "LINE":
      requireMatchCount(pattern, 1);
      requireLineMasks(pattern);
      break;
    case "TWO_LINES":
      requireMatchCount(pattern, 2);
      requireLineMasks(pattern);
      break;
    case "FOUR_CORNERS":
      requireMatchCount(pattern, 1);
      requireSingleMask(pattern, FOUR_CORNERS_MASK);
      break;
    case "FULL_CARD":
      requireMatchCount(pattern, 1);
      if (
        pattern.masks.length !== 1 ||
        ![ALL_POSITIONS_MASK, PLAYABLE_POSITIONS_MASK].includes(
          pattern.masks[0]!.positionMask,
        )
      ) {
        invalidPattern("FULL_CARD requires the complete playable layout mask");
      }
      break;
    case "CUSTOM":
      break;
    default:
      invalidPattern("Unsupported pattern kind", { kind: pattern.kind });
  }
}

function validateMask(mask: BingoPositionMask): void {
  if (mask.id.trim().length === 0) invalidMask("A pattern mask id is required");
  if (!Number.isInteger(mask.sequence) || mask.sequence <= 0) {
    invalidMask("A pattern mask sequence must be a positive integer", {
      sequence: mask.sequence,
    });
  }
  validateRawMask(mask.positionMask);
}

function validateRawMask(mask: number): void {
  if (!Number.isSafeInteger(mask) || mask <= 0 || mask > ALL_POSITIONS_MASK) {
    invalidMask("A position mask must be a non-empty unsigned 25-bit integer", {
      mask,
    });
  }
  if ((mask & PLAYABLE_POSITIONS_MASK) === 0) {
    invalidMask("A position mask cannot be satisfied only by the FREE center", {
      mask,
    });
  }
}

function requireMatchCount(
  pattern: BingoPatternDefinition,
  expected: number,
): void {
  if (pattern.requiredMatchCount !== expected) {
    invalidPattern(`${pattern.kind} requires requiredMatchCount=${expected}`);
  }
}

function requireLineMasks(pattern: BingoPatternDefinition): void {
  if (pattern.kind === "TWO_LINES" && pattern.masks.length < 2) {
    invalidPattern("TWO_LINES requires at least two configured line masks");
  }
  for (const mask of pattern.masks) {
    if (!VALID_LINE_MASKS.has(mask.positionMask)) {
      invalidPattern("LINE patterns accept only explicit straight line masks", {
        positionMask: mask.positionMask,
      });
    }
  }
}

function requireSingleMask(
  pattern: BingoPatternDefinition,
  expectedMask: number,
): void {
  if (
    pattern.masks.length !== 1 ||
    pattern.masks[0]!.positionMask !== expectedMask
  ) {
    invalidPattern(`${pattern.kind} requires its canonical explicit mask`);
  }
}

function invalidPattern(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new BingoPatternDomainError(
    BINGO_PATTERN_ERROR_CODES.INVALID_PATTERN,
    message,
    details,
  );
}

function invalidMask(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new BingoPatternDomainError(
    BINGO_PATTERN_ERROR_CODES.INVALID_MASK,
    message,
    details,
  );
}
