import type { CanonicalBingoCard } from "../cards";

export const BINGO_PATTERN_KINDS = [
  "LINE",
  "TWO_LINES",
  "FOUR_CORNERS",
  "FULL_CARD",
  "CUSTOM",
] as const;

export type BingoPatternKind = (typeof BINGO_PATTERN_KINDS)[number];

export interface BingoPositionMask {
  readonly id: string;
  readonly sequence: number;
  /** Unsigned 25-bit mask. Position n maps to bit n. */
  readonly positionMask: number;
}

export interface BingoPatternDefinition {
  readonly id: string;
  readonly kind: BingoPatternKind;
  readonly requiredMatchCount: number;
  readonly masks: readonly BingoPositionMask[];
  /** True only after the persisted round configuration has been frozen. */
  readonly configurationFrozen: boolean;
}

export interface BingoDrawValue {
  readonly sequence: number;
  readonly ball: number;
}

export interface MatchedPatternMaskEvidence {
  readonly id: string;
  readonly sequence: number;
  readonly positionMask: number;
  readonly requiredBallMask: bigint;
  readonly completedAtDrawSequence: number;
}

export interface PatternEvaluationEvidence {
  readonly cardLayoutHash: string;
  readonly drawnBallMaskAtDecision: bigint;
  readonly matchedPatternMasks: readonly MatchedPatternMaskEvidence[];
}

export interface PatternEvaluationResult {
  readonly matched: boolean;
  readonly pattern: Readonly<Pick<BingoPatternDefinition, "id" | "kind">>;
  readonly decisiveDrawSequence: number | null;
  readonly decisiveBall: number | null;
  /** Union of all pattern-position masks satisfied at the decisive draw. */
  readonly matchedPositionMask: number;
  /** Union of the card ball masks required by those satisfied patterns. */
  readonly matchedNumbersMask: bigint;
  readonly evidence: PatternEvaluationEvidence;
}

export interface PatternCardReference {
  readonly cardId: string;
  readonly card: CanonicalBingoCard;
}

export interface PatternCandidate {
  readonly cardId: string;
  readonly cardLayoutHash: string;
  readonly evaluation: PatternEvaluationResult;
}
