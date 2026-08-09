import type { PatternCandidate, PatternEvaluationResult } from "../patterns";
import { evidenceFingerprint } from "./fingerprint";

export type CandidateCreationCode =
  | "CANDIDATE_CREATED"
  | "INVALID_EXECUTION_REFERENCE"
  | "INVALID_CARD_REFERENCE"
  | "PATTERN_NOT_MATCHED"
  | "DECISIVE_DRAW_MISMATCH"
  | "INVALID_PATTERN_EVIDENCE";

export interface DecisiveDrawReference {
  readonly id: string;
  readonly sequence: number;
  readonly ball: number;
  readonly evidenceHash: string;
}

export interface PatternMatch {
  readonly executionId: string;
  readonly cardId: string;
  readonly cardLayoutHash: string;
  readonly patternId: string;
  readonly patternKind: PatternEvaluationResult["pattern"]["kind"];
  readonly decisiveDraw: DecisiveDrawReference;
  readonly matchedMask: number;
  readonly drawnBallMaskAtDecision: bigint;
  readonly matchedPatternMasks: readonly Readonly<{
    id: string;
    sequence: number;
    positionMask: number;
    requiredBallMask: bigint;
    completedAtDrawSequence: number;
  }>[];
}

export interface WinnerCandidate {
  readonly id: string;
  readonly fingerprint: string;
  readonly status: "PENDING";
  readonly match: PatternMatch;
}

export type CandidateCreationDecision =
  | Readonly<{
      created: true;
      code: "CANDIDATE_CREATED";
      candidate: WinnerCandidate;
    }>
  | Readonly<{
      created: false;
      code: Exclude<CandidateCreationCode, "CANDIDATE_CREATED">;
    }>;

function nonBlank(value: string): boolean {
  return value.trim().length > 0;
}

export function createWinnerCandidate(
  input: Readonly<{
    executionId: string;
    patternCandidate: PatternCandidate;
    decisiveDraw: DecisiveDrawReference;
  }>,
): CandidateCreationDecision {
  if (!nonBlank(input.executionId)) {
    return { created: false, code: "INVALID_EXECUTION_REFERENCE" };
  }
  if (!nonBlank(input.patternCandidate.cardId)) {
    return { created: false, code: "INVALID_CARD_REFERENCE" };
  }
  const evaluation = input.patternCandidate.evaluation;
  if (!evaluation.matched) {
    return { created: false, code: "PATTERN_NOT_MATCHED" };
  }
  if (
    evaluation.decisiveDrawSequence !== input.decisiveDraw.sequence ||
    evaluation.decisiveBall !== input.decisiveDraw.ball
  ) {
    return { created: false, code: "DECISIVE_DRAW_MISMATCH" };
  }
  if (
    !nonBlank(input.patternCandidate.cardLayoutHash) ||
    !nonBlank(evaluation.pattern.id) ||
    !nonBlank(input.decisiveDraw.id) ||
    !nonBlank(input.decisiveDraw.evidenceHash) ||
    !Number.isInteger(evaluation.matchedMask) ||
    evaluation.matchedMask <= 0 ||
    evaluation.evidence.matchedPatternMasks.length === 0
  ) {
    return { created: false, code: "INVALID_PATTERN_EVIDENCE" };
  }

  const matchedPatternMasks = Object.freeze(
    [...evaluation.evidence.matchedPatternMasks]
      .sort(
        (left, right) =>
          left.sequence - right.sequence || left.id.localeCompare(right.id),
      )
      .map((mask) => Object.freeze({ ...mask })),
  );
  const match: PatternMatch = Object.freeze({
    cardId: input.patternCandidate.cardId,
    cardLayoutHash: input.patternCandidate.cardLayoutHash,
    decisiveDraw: Object.freeze({ ...input.decisiveDraw }),
    drawnBallMaskAtDecision: evaluation.evidence.drawnBallMaskAtDecision,
    executionId: input.executionId,
    matchedMask: evaluation.matchedMask,
    matchedPatternMasks,
    patternId: evaluation.pattern.id,
    patternKind: evaluation.pattern.kind,
  });
  const fingerprint = evidenceFingerprint({
    cardId: match.cardId,
    cardLayoutHash: match.cardLayoutHash,
    decisiveDraw: {
      ball: match.decisiveDraw.ball,
      evidenceHash: match.decisiveDraw.evidenceHash,
      id: match.decisiveDraw.id,
      sequence: match.decisiveDraw.sequence,
    },
    drawnBallMaskAtDecision: match.drawnBallMaskAtDecision,
    executionId: match.executionId,
    matchedMask: match.matchedMask,
    matchedPatternMasks: match.matchedPatternMasks.map((mask) => ({
      completedAtDrawSequence: mask.completedAtDrawSequence,
      id: mask.id,
      positionMask: mask.positionMask,
      requiredBallMask: mask.requiredBallMask,
      sequence: mask.sequence,
    })),
    patternId: match.patternId,
    patternKind: match.patternKind,
  });
  return {
    created: true,
    code: "CANDIDATE_CREATED",
    candidate: Object.freeze({
      fingerprint,
      id: `candidate:${fingerprint}`,
      match,
      status: "PENDING",
    }),
  };
}
