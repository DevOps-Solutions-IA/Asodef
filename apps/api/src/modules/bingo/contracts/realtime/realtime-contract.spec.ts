import {
  assertBingoRealtimePayloadSafe,
  BINGO_REALTIME_EVENT_TYPES,
  BINGO_REALTIME_SURFACE_POLICY,
  decideBingoRealtimeResume,
} from "./realtime-contract";

describe("Bingo realtime protocol contracts", () => {
  const cursor = {
    stream: "public:bingo-2026",
    lastEventId: "evt-10",
    lastSequence: 10,
  };

  it("continues only with the next contiguous stream sequence", () => {
    expect(
      decideBingoRealtimeResume(cursor, {
        stream: cursor.stream,
        sequence: 11,
      }),
    ).toEqual({ kind: "CONTINUE", acceptSequence: 11 });
  });

  it("deduplicates replayed Last-Event-ID data", () => {
    expect(
      decideBingoRealtimeResume(cursor, {
        stream: cursor.stream,
        sequence: 10,
      }),
    ).toEqual({ kind: "IGNORE_DUPLICATE", acceptSequence: 10 });
    expect(
      decideBingoRealtimeResume(cursor, { stream: cursor.stream, sequence: 8 }),
    ).toEqual({ kind: "IGNORE_DUPLICATE", acceptSequence: 10 });
  });

  it("requires REST snapshot resync for gaps and stream changes", () => {
    expect(
      decideBingoRealtimeResume(cursor, {
        stream: cursor.stream,
        sequence: 12,
      }),
    ).toEqual({
      kind: "RESYNC_REQUIRED",
      expectedSequence: 11,
      receivedSequence: 12,
    });
    expect(
      decideBingoRealtimeResume(cursor, { stream: "other", sequence: 11 }).kind,
    ).toBe("RESYNC_REQUIRED");
  });

  it("uses explicitly versioned event names and separated authorization surfaces", () => {
    expect(
      BINGO_REALTIME_EVENT_TYPES.every((type) => type.endsWith(".v1")),
    ).toBe(true);
    expect(BINGO_REALTIME_SURFACE_POLICY.PUBLIC.authentication).toBe("NONE");
    expect(BINGO_REALTIME_SURFACE_POLICY.AFFILIATE.authentication).toBe(
      "SELF_SERVICE_AFFILIATE",
    );
    expect(BINGO_REALTIME_SURFACE_POLICY.ADMIN.authentication).toBe(
      "ADMIN_SESSION_AND_PERMISSION",
    );
  });

  it.each([
    "documentNumber",
    "phone",
    "email",
    "subjectRef",
    "affiliateId",
    "secretSeed",
    "seed",
  ])("rejects realtime field %s", (field) =>
    expect(() =>
      assertBingoRealtimePayloadSafe({
        eventSlug: "safe",
        nested: { [field]: "secret" },
      }),
    ).toThrow("BINGO_REALTIME_FIELD_FORBIDDEN"),
  );
});
