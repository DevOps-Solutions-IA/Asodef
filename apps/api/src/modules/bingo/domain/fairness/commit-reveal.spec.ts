import {
  BINGO_COMMIT_REVEAL_CONTEXT,
  BINGO_COMMIT_REVEAL_PROTOCOL_VERSION,
  buildCommitmentEnvelope,
  calculateCommitment,
  calculateConfigurationHash,
  canonicalCommitmentBytes,
  CommitmentInput,
  verifyCommitment,
} from "./commit-reveal";
import { BingoFairnessErrorCode } from "./fairness-errors";

const seed = Uint8Array.from({ length: 32 }, (_, index) => index);

function input(overrides: Partial<CommitmentInput> = {}): CommitmentInput {
  return {
    protocolVersion: BINGO_COMMIT_REVEAL_PROTOCOL_VERSION,
    eventId: "10000000-0000-4000-8000-000000000001",
    roundId: "20000000-0000-4000-8000-000000000002",
    executionId: "30000000-0000-4000-8000-000000000003",
    revision: 1,
    configurationHash: calculateConfigurationHash({}),
    algorithmId: "asodef-bingo-draw-v1",
    seed,
    ...overrides,
  };
}

describe("Bingo commit-reveal primitives", () => {
  it("builds the exact domain-separated v1 envelope", () => {
    expect(buildCommitmentEnvelope(input())).toEqual({
      context: BINGO_COMMIT_REVEAL_CONTEXT,
      protocolVersion: BINGO_COMMIT_REVEAL_PROTOCOL_VERSION,
      eventId: "10000000-0000-4000-8000-000000000001",
      roundId: "20000000-0000-4000-8000-000000000002",
      executionId: "30000000-0000-4000-8000-000000000003",
      revision: 1,
      configurationHash:
        "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      algorithmId: "asodef-bingo-draw-v1",
      seed: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
    });
  });

  it("has stable canonical bytes and a known v1 commitment vector", () => {
    const bytes = canonicalCommitmentBytes(input());
    expect(bytes.toString("utf8")).toBe(
      '{"algorithmId":"asodef-bingo-draw-v1","configurationHash":"44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a","context":"ASODEF_BINGO_EXECUTION_COMMITMENT","eventId":"10000000-0000-4000-8000-000000000001","executionId":"30000000-0000-4000-8000-000000000003","protocolVersion":"asodef-bingo-commit-reveal-v1","revision":1,"roundId":"20000000-0000-4000-8000-000000000002","seed":"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"}',
    );
    expect(calculateCommitment(input())).toBe(
      "280ea1785ac013288041193c4677b3a9ec034d4af252d0799ee0676790273bb8",
    );
  });

  it("verifies a reveal and fails a wrong seed explicitly", () => {
    const commitment = calculateCommitment(input());
    expect(verifyCommitment(input(), commitment)).toEqual({
      status: "VERIFIED",
    });
    expect(
      verifyCommitment(input({ seed: new Uint8Array(32).fill(7) }), commitment),
    ).toEqual({ status: "FAILED", code: "BINGO_FAIRNESS_COMMITMENT_MISMATCH" });
  });

  it("changes the commitment for every variable envelope field", () => {
    const baseline = calculateCommitment(input());
    const variants: CommitmentInput[] = [
      input({ eventId: "10000000-0000-4000-8000-000000000009" }),
      input({ roundId: "20000000-0000-4000-8000-000000000009" }),
      input({ executionId: "30000000-0000-4000-8000-000000000009" }),
      input({ revision: 2 }),
      input({ configurationHash: "f".repeat(64) }),
      input({ algorithmId: "asodef-bingo-draw-v2" }),
      input({ seed: new Uint8Array(32).fill(1) }),
    ];

    expect(new Set(variants.map(calculateCommitment)).size).toBe(
      variants.length,
    );
    for (const variant of variants) {
      expect(calculateCommitment(variant)).not.toBe(baseline);
    }
  });

  it("fails closed for unsupported versions, algorithms, IDs, hashes and seeds", () => {
    const invalidCases: Array<{
      value: CommitmentInput;
      code: BingoFairnessErrorCode;
    }> = [
      {
        value: input({ protocolVersion: "asodef-bingo-commit-reveal-v2" }),
        code: BingoFairnessErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      },
      {
        value: input({ algorithmId: "../dynamic-code" }),
        code: BingoFairnessErrorCode.INVALID_ALGORITHM_ID,
      },
      {
        value: input({ eventId: "not-a-uuid" }),
        code: BingoFairnessErrorCode.INVALID_IDENTIFIER,
      },
      {
        value: input({ revision: 0 }),
        code: BingoFairnessErrorCode.INVALID_REVISION,
      },
      {
        value: input({ configurationHash: "A".repeat(64) }),
        code: BingoFairnessErrorCode.INVALID_CONFIGURATION_HASH,
      },
      {
        value: input({ seed: new Uint8Array(31) }),
        code: BingoFairnessErrorCode.INVALID_SEED,
      },
    ];

    for (const invalid of invalidCases) {
      expect(() => calculateCommitment(invalid.value)).toThrow(
        expect.objectContaining({ code: invalid.code }),
      );
      expect(verifyCommitment(invalid.value, "0".repeat(64))).toEqual({
        status: "FAILED",
        code: invalid.code,
      });
    }
  });

  it("rejects malformed, uppercase and wrong-length commitments before comparison", () => {
    for (const commitment of ["not-a-hash", "A".repeat(64), "0".repeat(62)]) {
      expect(verifyCommitment(input(), commitment)).toEqual({
        status: "FAILED",
        code: BingoFairnessErrorCode.INVALID_COMMITMENT,
      });
    }
  });

  it("rejects attempts to change the fixed context", () => {
    expect(() =>
      calculateCommitment(
        input({
          context: "WRONG_CONTEXT" as typeof BINGO_COMMIT_REVEAL_CONTEXT,
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: BingoFairnessErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      }),
    );
  });
});
