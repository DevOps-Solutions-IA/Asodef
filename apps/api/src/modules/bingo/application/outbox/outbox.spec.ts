import { assertOutboxPayload } from "./outbox-validation";

const ID = "11111111-1111-4111-8111-111111111111";

describe("Bingo outbox contracts", () => {
  it("accepts a PII-free administrative configuration event", () => {
    expect(() =>
      assertOutboxPayload("bingo.event.created.v1", {
        schemaVersion: 1,
        resourceId: ID,
        resourceType: "EVENT",
        eventId: ID,
        configurationVersion: 1,
        occurredAt: "2026-08-11T12:00:00.000Z",
      }),
    ).not.toThrow();
  });
  it("accepts the versioned draw allowlist", () => {
    expect(() =>
      assertOutboxPayload("bingo.draw.created.v1", {
        schemaVersion: 1,
        drawId: ID,
        executionId: ID,
        roundId: ID,
        sequence: 1,
        ballNumber: 75,
        stateVersion: 1,
        drawnAt: "2026-08-11T12:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects PII and unrevealed seed fields", () => {
    for (const forbidden of ["document", "phone", "email", "seed"] as const) {
      expect(() =>
        assertOutboxPayload("bingo.draw.created.v1", {
          schemaVersion: 1,
          drawId: ID,
          executionId: ID,
          roundId: ID,
          sequence: 1,
          ballNumber: 75,
          stateVersion: 1,
          drawnAt: "2026-08-11T12:00:00.000Z",
          [forbidden]: "secret",
        }),
      ).toThrow("BINGO_OUTBOX_INVALID_PAYLOAD");
    }
  });

  it("rejects unversioned or unknown event types at runtime", () => {
    expect(() =>
      assertOutboxPayload("bingo.draw.created" as never, {}),
    ).toThrow("BINGO_OUTBOX_INVALID_PAYLOAD:eventType");
  });
});
