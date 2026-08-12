import { createHash } from "node:crypto";

import { CryptoRandomSource, type RandomSource } from "../../domain/random";
import {
  BingoFairnessApplicationErrorCode,
  failFairnessApplication,
} from "./fairness-application-error";

export const BINGO_BALL_MIN = 1;
export const BINGO_BALL_MAX = 75;
export const CRYPTO_RNG_DRAW_ALGORITHM = "node-crypto-random-int-v1";
export const BINGO_DRAW_EVIDENCE_VERSION = "asodef-bingo-draw-evidence-v1";

export interface BallSelectionEvidence {
  readonly evidenceVersion: typeof BINGO_DRAW_EVIDENCE_VERSION;
  readonly fairnessMode: "CRYPTO_RNG" | "CRYPTO_RNG_COMMIT_REVEAL";
  readonly algorithmId: string;
  readonly availableBallCount: number;
  readonly availableBallsHash: string;
  readonly selectedIndex: number;
}

export interface BallSelectionResult {
  readonly ball: number;
  readonly evidence: BallSelectionEvidence;
}

export interface BallSelector {
  selectBall(availableBalls: readonly number[]): BallSelectionResult;
}

export function normalizeAvailableBalls(
  availableBalls: readonly number[],
): readonly number[] {
  if (availableBalls.length === 0) {
    failFairnessApplication(
      BingoFairnessApplicationErrorCode.NO_BALLS_REMAINING,
    );
  }

  const normalized = [...availableBalls].sort((left, right) => left - right);
  for (let index = 0; index < normalized.length; index += 1) {
    const ball = normalized[index]!;
    if (
      !Number.isInteger(ball) ||
      ball < BINGO_BALL_MIN ||
      ball > BINGO_BALL_MAX ||
      (index > 0 && ball === normalized[index - 1]!)
    ) {
      failFairnessApplication(
        BingoFairnessApplicationErrorCode.INVALID_AVAILABLE_BALLS,
        { field: "availableBalls" },
      );
    }
  }

  return normalized;
}

export function hashAvailableBalls(availableBalls: readonly number[]): string {
  return createHash("sha256").update(Buffer.from(availableBalls)).digest("hex");
}

export class CryptoBallSelector implements BallSelector {
  constructor(
    private readonly randomSource: RandomSource = new CryptoRandomSource(),
  ) {}

  selectBall(availableBalls: readonly number[]): BallSelectionResult {
    const normalized = normalizeAvailableBalls(availableBalls);
    const selectedIndex = this.randomSource.nextInt(normalized.length);

    return {
      ball: normalized[selectedIndex]!,
      evidence: {
        evidenceVersion: BINGO_DRAW_EVIDENCE_VERSION,
        fairnessMode: "CRYPTO_RNG",
        algorithmId: CRYPTO_RNG_DRAW_ALGORITHM,
        availableBallCount: normalized.length,
        availableBallsHash: hashAvailableBalls(normalized),
        selectedIndex,
      },
    };
  }
}
