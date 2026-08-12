import { createHash, createHmac } from "node:crypto";

import {
  BINGO_COMMIT_REVEAL_PROTOCOL_VERSION,
  BINGO_COMMIT_REVEAL_SEED_LENGTH,
  canonicalJsonBytes,
} from "../../domain/fairness";
import {
  BINGO_DRAW_EVIDENCE_VERSION,
  BallSelectionResult,
  hashAvailableBalls,
  normalizeAvailableBalls,
} from "./ball-selection";
import {
  BingoFairnessApplicationErrorCode,
  failFairnessApplication,
} from "./fairness-application-error";
import {
  ProtectedSeedReference,
  SeedCustody,
  SeedCustodyContext,
} from "./seed-custody";

export const COMMIT_REVEAL_DRAW_ALGORITHM =
  "asodef-bingo-hmac-sha256-rejection-v1";
export const COMMIT_REVEAL_DRAW_CONTEXT = "ASODEF_BINGO_DRAW_SELECTION";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/;
const SAMPLE_SPACE = 2 ** 48;

export interface CommitRevealDrawInput {
  readonly executionId: string;
  readonly configurationHash: string;
  readonly drawSequence: number;
  readonly availableBalls: readonly number[];
}

export interface CommitRevealDerivationEvidence {
  readonly derivationCounter: number;
  readonly derivationMessageHash: string;
}

function validateDrawInput(input: CommitRevealDrawInput): void {
  if (!UUID.test(input.executionId)) {
    failFairnessApplication(
      BingoFairnessApplicationErrorCode.INVALID_EXECUTION_ID,
      { field: "executionId" },
    );
  }
  if (!LOWERCASE_SHA256.test(input.configurationHash)) {
    failFairnessApplication(
      BingoFairnessApplicationErrorCode.INVALID_CONFIGURATION_HASH,
      { field: "configurationHash" },
    );
  }
  if (!Number.isSafeInteger(input.drawSequence) || input.drawSequence < 1) {
    failFairnessApplication(
      BingoFairnessApplicationErrorCode.INVALID_DRAW_SEQUENCE,
      { field: "drawSequence" },
    );
  }
}

function derivationMessage(
  input: CommitRevealDrawInput,
  availableBallsHash: string,
  counter: number,
): Buffer {
  return canonicalJsonBytes({
    algorithmId: COMMIT_REVEAL_DRAW_ALGORITHM,
    availableBallsHash,
    configurationHash: input.configurationHash,
    context: COMMIT_REVEAL_DRAW_CONTEXT,
    counter,
    drawSequence: input.drawSequence,
    executionId: input.executionId,
    protocolVersion: BINGO_COMMIT_REVEAL_PROTOCOL_VERSION,
  });
}

/**
 * Deterministic uniform selection using 48-bit HMAC samples and rejection.
 * Rejection discards the incomplete tail of the sample space, preventing
 * modulo bias for every available-ball count from 1 through 75.
 */
export function deriveCommitRevealBall(
  seed: Uint8Array,
  input: CommitRevealDrawInput,
): BallSelectionResult & CommitRevealDerivationEvidence {
  if (
    !(seed instanceof Uint8Array) ||
    seed.byteLength !== BINGO_COMMIT_REVEAL_SEED_LENGTH
  ) {
    failFairnessApplication(
      BingoFairnessApplicationErrorCode.INVALID_PROTECTED_SEED,
      { field: "seed" },
    );
  }
  validateDrawInput(input);
  const availableBalls = normalizeAvailableBalls(input.availableBalls);
  const availableBallsHash = hashAvailableBalls(availableBalls);
  const acceptanceLimit =
    Math.floor(SAMPLE_SPACE / availableBalls.length) * availableBalls.length;

  for (let counter = 0; counter < Number.MAX_SAFE_INTEGER; counter += 1) {
    const message = derivationMessage(input, availableBallsHash, counter);
    const digest = createHmac("sha256", seed).update(message).digest();
    const sample = digest.readUIntBE(0, 6);
    if (sample >= acceptanceLimit) {
      continue;
    }

    const selectedIndex = sample % availableBalls.length;
    return {
      ball: availableBalls[selectedIndex]!,
      evidence: {
        evidenceVersion: BINGO_DRAW_EVIDENCE_VERSION,
        fairnessMode: "CRYPTO_RNG_COMMIT_REVEAL",
        algorithmId: COMMIT_REVEAL_DRAW_ALGORITHM,
        availableBallCount: availableBalls.length,
        availableBallsHash,
        selectedIndex,
      },
      derivationCounter: counter,
      derivationMessageHash: createHash("sha256").update(message).digest("hex"),
    };
  }

  throw new Error("Unreachable commit-reveal rejection-sampling exhaustion");
}

export interface ProtectedCommitRevealDrawInput extends CommitRevealDrawInput {
  readonly custodyContext: SeedCustodyContext;
  readonly protectedSeed: ProtectedSeedReference;
}

export class CommitRevealBallSelector {
  constructor(private readonly custody: SeedCustody) {}

  selectBall(
    input: ProtectedCommitRevealDrawInput,
  ): Promise<BallSelectionResult & CommitRevealDerivationEvidence> {
    return this.custody.withProtectedSeed(
      input.protectedSeed,
      input.custodyContext,
      (seed) => deriveCommitRevealBall(seed, input),
    );
  }
}
