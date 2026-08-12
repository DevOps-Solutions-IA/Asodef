import { assertPublicBingoPayloadSafe, type PublicBingoSnapshotContract } from "./public-contract";

describe("Bingo public contracts", () => {
  const safeSnapshot: PublicBingoSnapshotContract = {
    eventSlug: "bingo-2026",
    roundOrder: 1,
    roundName: "Línea",
    status: "IN_PROGRESS",
    currentBall: 22,
    drawnBalls: [1, 22],
    lastSequence: 2,
    updatedAt: "2026-12-01T20:00:00.000Z",
    winners: [{ cardNumber: 1024, displayName: "Ma*** Pe***", confirmedAt: "2026-12-01T20:30:00.000Z" }],
    fairness: { protocolVersion: "1", commitment: "b".repeat(64) },
  };

  it("accepts an allowlisted public snapshot without PII or internal IDs", () => {
    expect(() => assertPublicBingoPayloadSafe(safeSnapshot)).not.toThrow();
  });

  it.each(["documentNumber", "phone", "email", "address", "subjectRef", "affiliateId", "secretSeed", "actorUserId"])(
    "rejects nested public field %s",
    (field) => expect(() => assertPublicBingoPayloadSafe({ ...safeSnapshot, winners: [{ cardNumber: 1, [field]: "secret" }] })).toThrow("BINGO_PUBLIC_FIELD_FORBIDDEN"),
  );

  it("does not expose an unrevealed seed in the fairness contract", () => {
    expect(safeSnapshot.fairness).not.toHaveProperty("revealedSeed");
    expect(safeSnapshot.fairness).not.toHaveProperty("seed");
  });
});
