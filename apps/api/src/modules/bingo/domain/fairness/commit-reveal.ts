import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalJsonBytes, CanonicalJsonValue } from "./canonical-json";
import {
  BingoFairnessError,
  BingoFairnessErrorCode,
  failFairness,
} from "./fairness-errors";

export const BINGO_COMMIT_REVEAL_CONTEXT = "ASODEF_BINGO_EXECUTION_COMMITMENT";
export const BINGO_COMMIT_REVEAL_PROTOCOL_VERSION =
  "asodef-bingo-commit-reveal-v1";
export const BINGO_COMMIT_REVEAL_HASH_ALGORITHM = "SHA-256";
export const BINGO_COMMIT_REVEAL_CANONICALIZATION_VERSION = "RFC8785-JCS-v1";
export const BINGO_COMMIT_REVEAL_SEED_LENGTH = 32;

const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALGORITHM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface CommitmentInput {
  readonly context?: typeof BINGO_COMMIT_REVEAL_CONTEXT;
  readonly protocolVersion: string;
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
  readonly revision: number;
  readonly configurationHash: string;
  readonly algorithmId: string;
  readonly seed: Uint8Array;
}

export interface CommitmentEnvelope {
  readonly context: typeof BINGO_COMMIT_REVEAL_CONTEXT;
  readonly protocolVersion: typeof BINGO_COMMIT_REVEAL_PROTOCOL_VERSION;
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
  readonly revision: number;
  readonly configurationHash: string;
  readonly algorithmId: string;
  readonly seed: string;
}

export type CommitmentVerificationResult =
  | { readonly status: "VERIFIED" }
  | {
      readonly status: "FAILED";
      readonly code:
        BingoFairnessErrorCode | "BINGO_FAIRNESS_COMMITMENT_MISMATCH";
    };

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateIdentifier(value: string, field: string): void {
  if (!UUID.test(value)) {
    failFairness(BingoFairnessErrorCode.INVALID_IDENTIFIER, { field });
  }
}

export function calculateConfigurationHash(
  configuration: CanonicalJsonValue,
): string {
  return sha256(canonicalJsonBytes(configuration));
}

export function buildCommitmentEnvelope(
  input: CommitmentInput,
): CommitmentEnvelope {
  if (
    input.context !== undefined &&
    input.context !== BINGO_COMMIT_REVEAL_CONTEXT
  ) {
    failFairness(BingoFairnessErrorCode.UNSUPPORTED_PROTOCOL_VERSION, {
      field: "context",
    });
  }
  if (input.protocolVersion !== BINGO_COMMIT_REVEAL_PROTOCOL_VERSION) {
    failFairness(BingoFairnessErrorCode.UNSUPPORTED_PROTOCOL_VERSION, {
      field: "protocolVersion",
    });
  }
  validateIdentifier(input.eventId, "eventId");
  validateIdentifier(input.roundId, "roundId");
  validateIdentifier(input.executionId, "executionId");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
    failFairness(BingoFairnessErrorCode.INVALID_REVISION, {
      field: "revision",
    });
  }
  if (!LOWERCASE_SHA256.test(input.configurationHash)) {
    failFairness(BingoFairnessErrorCode.INVALID_CONFIGURATION_HASH, {
      field: "configurationHash",
    });
  }
  if (!ALGORITHM_ID.test(input.algorithmId)) {
    failFairness(BingoFairnessErrorCode.INVALID_ALGORITHM_ID, {
      field: "algorithmId",
    });
  }
  if (
    !(input.seed instanceof Uint8Array) ||
    input.seed.byteLength !== BINGO_COMMIT_REVEAL_SEED_LENGTH
  ) {
    failFairness(BingoFairnessErrorCode.INVALID_SEED, { field: "seed" });
  }

  return {
    context: BINGO_COMMIT_REVEAL_CONTEXT,
    protocolVersion: BINGO_COMMIT_REVEAL_PROTOCOL_VERSION,
    eventId: input.eventId,
    roundId: input.roundId,
    executionId: input.executionId,
    revision: input.revision,
    configurationHash: input.configurationHash,
    algorithmId: input.algorithmId,
    seed: Buffer.from(input.seed).toString("base64url"),
  };
}

export function canonicalCommitmentBytes(input: CommitmentInput): Buffer {
  return canonicalJsonBytes({ ...buildCommitmentEnvelope(input) });
}

export function calculateCommitment(input: CommitmentInput): string {
  return sha256(canonicalCommitmentBytes(input));
}

export function verifyCommitment(
  input: CommitmentInput,
  expectedCommitment: string,
): CommitmentVerificationResult {
  if (!LOWERCASE_SHA256.test(expectedCommitment)) {
    return {
      status: "FAILED",
      code: BingoFairnessErrorCode.INVALID_COMMITMENT,
    };
  }

  try {
    const actual = Buffer.from(calculateCommitment(input), "hex");
    const expected = Buffer.from(expectedCommitment, "hex");
    return timingSafeEqual(actual, expected)
      ? { status: "VERIFIED" }
      : { status: "FAILED", code: "BINGO_FAIRNESS_COMMITMENT_MISMATCH" };
  } catch (error) {
    if (error instanceof BingoFairnessError) {
      return { status: "FAILED", code: error.code };
    }
    return {
      status: "FAILED",
      code: BingoFairnessErrorCode.INVALID_COMMITMENT,
    };
  }
}
