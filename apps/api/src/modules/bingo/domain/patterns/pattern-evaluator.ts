import { BINGO_FREE_INDEX, type CanonicalBingoCard } from "../cards";
import {
  positionsFromMask,
  validatePatternDefinition,
} from "./pattern-definition";
import {
  BINGO_PATTERN_ERROR_CODES,
  BingoPatternDomainError,
} from "./pattern-errors";
import type {
  BingoDrawValue,
  BingoPatternDefinition,
  MatchedPatternMaskEvidence,
  PatternCandidate,
  PatternCardReference,
  PatternEvaluationResult,
} from "./pattern-types";

interface DrawIndex {
  readonly ordered: readonly BingoDrawValue[];
  readonly byBall: ReadonlyMap<number, BingoDrawValue>;
  readonly bySequence: ReadonlyMap<number, BingoDrawValue>;
}

interface PreparedPattern {
  readonly definition: BingoPatternDefinition;
  readonly masks: readonly {
    readonly id: string;
    readonly sequence: number;
    readonly positionMask: number;
    readonly positions: readonly number[];
  }[];
}

export function evaluatePattern(
  card: CanonicalBingoCard,
  draws: readonly BingoDrawValue[],
  pattern: BingoPatternDefinition,
): PatternEvaluationResult {
  return evaluatePreparedPattern(
    card,
    indexDraws(draws),
    preparePattern(pattern),
  );
}

function evaluatePreparedPattern(
  card: CanonicalBingoCard,
  drawIndex: DrawIndex,
  pattern: PreparedPattern,
): PatternEvaluationResult {
  const completedMasks = pattern.masks
    .map((mask) => {
      let requiredBallMask = 0n;
      let completedAtDrawSequence = 0;
      let complete = true;

      for (const position of mask.positions) {
        if (position === BINGO_FREE_INDEX) continue;
        const ball = card.numbers[position]!;
        requiredBallMask |= 1n << BigInt(ball - 1);
        const draw = drawIndex.byBall.get(ball);
        if (!draw) {
          complete = false;
          break;
        }
        completedAtDrawSequence = Math.max(
          completedAtDrawSequence,
          draw.sequence,
        );
      }

      return complete
        ? ({
            completedAtDrawSequence,
            id: mask.id,
            positionMask: mask.positionMask,
            requiredBallMask,
            sequence: mask.sequence,
          } satisfies MatchedPatternMaskEvidence)
        : null;
    })
    .filter((mask): mask is MatchedPatternMaskEvidence => mask !== null)
    .sort(compareCompletedMasks);

  if (completedMasks.length < pattern.definition.requiredMatchCount) {
    return unmatchedResult(card, pattern.definition);
  }

  const decisiveDrawSequence =
    completedMasks[pattern.definition.requiredMatchCount - 1]!
      .completedAtDrawSequence;
  const decisiveDraw = drawIndex.bySequence.get(decisiveDrawSequence)!;
  const matchedAtDecision = completedMasks
    .filter((mask) => mask.completedAtDrawSequence <= decisiveDrawSequence)
    .sort((left, right) => left.sequence - right.sequence);
  let matchedMask = 0;
  for (const mask of matchedAtDecision) matchedMask |= mask.positionMask;

  return Object.freeze({
    decisiveBall: decisiveDraw.ball,
    decisiveDrawSequence,
    evidence: Object.freeze({
      cardLayoutHash: card.layoutHash,
      drawnBallMaskAtDecision: drawMaskThrough(
        drawIndex.ordered,
        decisiveDrawSequence,
      ),
      matchedPatternMasks: Object.freeze(matchedAtDecision),
    }),
    matched: true,
    matchedMask,
    pattern: Object.freeze({
      id: pattern.definition.id,
      kind: pattern.definition.kind,
    }),
  });
}

export function evaluatePatternBatch(
  cards: readonly PatternCardReference[],
  draws: readonly BingoDrawValue[],
  pattern: BingoPatternDefinition,
): readonly PatternCandidate[] {
  const cardIds = new Set<string>();
  for (const reference of cards) {
    if (reference.cardId.trim().length === 0 || cardIds.has(reference.cardId)) {
      throw new BingoPatternDomainError(
        BINGO_PATTERN_ERROR_CODES.DUPLICATE_CARD_REFERENCE,
        "Each evaluated card must have a unique non-empty reference",
        { cardId: reference.cardId },
      );
    }
    cardIds.add(reference.cardId);
  }

  const preparedPattern = preparePattern(pattern);
  const drawIndex = indexDraws(draws);

  return Object.freeze(
    cards
      .map((reference) => ({
        cardId: reference.cardId,
        cardLayoutHash: reference.card.layoutHash,
        evaluation: evaluatePreparedPattern(
          reference.card,
          drawIndex,
          preparedPattern,
        ),
      }))
      .filter((candidate) => candidate.evaluation.matched)
      .sort((left, right) => left.cardId.localeCompare(right.cardId)),
  );
}

function indexDraws(draws: readonly BingoDrawValue[]): DrawIndex {
  const ordered = [...draws].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const sequences = new Set<number>();
  const byBall = new Map<number, BingoDrawValue>();
  const bySequence = new Map<number, BingoDrawValue>();
  for (const draw of ordered) {
    if (
      !Number.isInteger(draw.sequence) ||
      draw.sequence <= 0 ||
      sequences.has(draw.sequence) ||
      !Number.isInteger(draw.ball) ||
      draw.ball < 1 ||
      draw.ball > 75 ||
      byBall.has(draw.ball)
    ) {
      throw new BingoPatternDomainError(
        BINGO_PATTERN_ERROR_CODES.INVALID_DRAW_SEQUENCE,
        "Draws require unique positive sequences and unique balls from 1 through 75",
        { ball: draw.ball, sequence: draw.sequence },
      );
    }
    sequences.add(draw.sequence);
    byBall.set(draw.ball, draw);
    bySequence.set(draw.sequence, draw);
  }
  return { byBall, bySequence, ordered: Object.freeze(ordered) };
}

function preparePattern(pattern: BingoPatternDefinition): PreparedPattern {
  validatePatternDefinition(pattern);
  return {
    definition: pattern,
    masks: pattern.masks.map((mask) => ({
      ...mask,
      positions: positionsFromMask(mask.positionMask),
    })),
  };
}

function compareCompletedMasks(
  left: MatchedPatternMaskEvidence,
  right: MatchedPatternMaskEvidence,
): number {
  return (
    left.completedAtDrawSequence - right.completedAtDrawSequence ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id)
  );
}

function drawMaskThrough(
  draws: readonly BingoDrawValue[],
  sequence: number,
): bigint {
  let mask = 0n;
  for (const draw of draws) {
    if (draw.sequence > sequence) break;
    mask |= 1n << BigInt(draw.ball - 1);
  }
  return mask;
}

function unmatchedResult(
  card: CanonicalBingoCard,
  pattern: BingoPatternDefinition,
): PatternEvaluationResult {
  return Object.freeze({
    decisiveBall: null,
    decisiveDrawSequence: null,
    evidence: Object.freeze({
      cardLayoutHash: card.layoutHash,
      drawnBallMaskAtDecision: 0n,
      matchedPatternMasks: Object.freeze([]),
    }),
    matched: false,
    matchedMask: 0,
    pattern: Object.freeze({ id: pattern.id, kind: pattern.kind }),
  });
}
