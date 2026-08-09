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
  readonly sequenceByBall: readonly number[];
  readonly ballBySequence: ReadonlyMap<number, number>;
  readonly drawnMaskBySequence: ReadonlyMap<number, bigint>;
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
  const maskCount = pattern.masks.length;
  const completionSequences = new Array<number>(maskCount).fill(0);
  const earliestCompletions: number[] = [];

  for (let maskIndex = 0; maskIndex < maskCount; maskIndex += 1) {
    const mask = pattern.masks[maskIndex]!;
    let completedAtDrawSequence = 0;

    for (const position of mask.positions) {
      if (position === BINGO_FREE_INDEX) continue;
      const ball = card.numbers[position]!;
      const drawSequence = drawIndex.sequenceByBall[ball]!;
      if (drawSequence === 0) {
        completedAtDrawSequence = 0;
        break;
      }
      if (drawSequence > completedAtDrawSequence) {
        completedAtDrawSequence = drawSequence;
      }
    }

    if (completedAtDrawSequence === 0) continue;
    completionSequences[maskIndex] = completedAtDrawSequence;
    insertCompletion(
      earliestCompletions,
      completedAtDrawSequence,
      pattern.definition.requiredMatchCount,
    );
  }

  if (earliestCompletions.length < pattern.definition.requiredMatchCount) {
    return unmatchedResult(card, pattern.definition);
  }

  const decisiveDrawSequence =
    earliestCompletions[pattern.definition.requiredMatchCount - 1]!;
  const matchedPatternMasks: MatchedPatternMaskEvidence[] = [];
  let matchedPositionMask = 0;
  let matchedNumbersMask = 0n;
  for (let maskIndex = 0; maskIndex < maskCount; maskIndex += 1) {
    const completedAtDrawSequence = completionSequences[maskIndex]!;
    if (
      completedAtDrawSequence === 0 ||
      completedAtDrawSequence > decisiveDrawSequence
    ) {
      continue;
    }
    const mask = pattern.masks[maskIndex]!;
    let requiredBallMask = 0n;
    for (const position of mask.positions) {
      if (position !== BINGO_FREE_INDEX) {
        requiredBallMask |= 1n << BigInt(card.numbers[position]! - 1);
      }
    }
    matchedPositionMask |= mask.positionMask;
    matchedNumbersMask |= requiredBallMask;
    matchedPatternMasks.push({
      completedAtDrawSequence,
      id: mask.id,
      positionMask: mask.positionMask,
      requiredBallMask,
      sequence: mask.sequence,
    });
  }

  return {
    decisiveBall: drawIndex.ballBySequence.get(decisiveDrawSequence)!,
    decisiveDrawSequence,
    evidence: {
      cardLayoutHash: card.layoutHash,
      drawnBallMaskAtDecision:
        drawIndex.drawnMaskBySequence.get(decisiveDrawSequence)!,
      matchedPatternMasks,
    },
    matched: true,
    matchedNumbersMask,
    matchedPositionMask,
    pattern: {
      id: pattern.definition.id,
      kind: pattern.definition.kind,
    },
  };
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

  const candidates: PatternCandidate[] = [];
  for (const reference of cards) {
    const evaluation = evaluatePreparedPattern(
      reference.card,
      drawIndex,
      preparedPattern,
    );
    if (evaluation.matched) {
      candidates.push({
        cardId: reference.cardId,
        cardLayoutHash: reference.card.layoutHash,
        evaluation,
      });
    }
  }
  candidates.sort((left, right) =>
    left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0,
  );
  return candidates;
}

function indexDraws(draws: readonly BingoDrawValue[]): DrawIndex {
  const ordered = [...draws].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const sequences = new Set<number>();
  const sequenceByBall = new Array<number>(76).fill(0);
  const ballBySequence = new Map<number, number>();
  const drawnMaskBySequence = new Map<number, bigint>();
  let cumulativeDrawnMask = 0n;
  for (const draw of ordered) {
    if (
      !Number.isInteger(draw.sequence) ||
      draw.sequence <= 0 ||
      sequences.has(draw.sequence) ||
      !Number.isInteger(draw.ball) ||
      draw.ball < 1 ||
      draw.ball > 75 ||
      sequenceByBall[draw.ball] !== 0
    ) {
      throw new BingoPatternDomainError(
        BINGO_PATTERN_ERROR_CODES.INVALID_DRAW_SEQUENCE,
        "Draws require unique positive sequences and unique balls from 1 through 75",
        { ball: draw.ball, sequence: draw.sequence },
      );
    }
    sequences.add(draw.sequence);
    sequenceByBall[draw.ball] = draw.sequence;
    ballBySequence.set(draw.sequence, draw.ball);
    cumulativeDrawnMask |= 1n << BigInt(draw.ball - 1);
    drawnMaskBySequence.set(draw.sequence, cumulativeDrawnMask);
  }
  return { ballBySequence, drawnMaskBySequence, sequenceByBall };
}

function preparePattern(pattern: BingoPatternDefinition): PreparedPattern {
  validatePatternDefinition(pattern);
  return {
    definition: pattern,
    masks: pattern.masks
      .map((mask) => ({
        ...mask,
        positions: positionsFromMask(mask.positionMask),
      }))
      .sort(
        (left, right) =>
          left.sequence - right.sequence || left.id.localeCompare(right.id),
      ),
  };
}

function insertCompletion(
  completions: number[],
  value: number,
  limit: number,
): void {
  let index = completions.length;
  while (index > 0 && completions[index - 1]! > value) index -= 1;
  completions.splice(index, 0, value);
  if (completions.length > limit) completions.pop();
}

function unmatchedResult(
  card: CanonicalBingoCard,
  pattern: BingoPatternDefinition,
): PatternEvaluationResult {
  return {
    decisiveBall: null,
    decisiveDrawSequence: null,
    evidence: {
      cardLayoutHash: card.layoutHash,
      drawnBallMaskAtDecision: 0n,
      matchedPatternMasks: [],
    },
    matched: false,
    matchedNumbersMask: 0n,
    matchedPositionMask: 0,
    pattern: { id: pattern.id, kind: pattern.kind },
  };
}
