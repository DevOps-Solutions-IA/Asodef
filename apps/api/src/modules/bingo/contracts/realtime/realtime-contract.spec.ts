import { BINGO_OUTBOX_EVENT_TYPES } from "../../application/outbox/outbox-contracts";
import {
  assertBingoRealtimeEnvelope,
  assertBingoRealtimePayloadSafe,
  BINGO_REALTIME_EVENT_TYPES,
  BINGO_REALTIME_SURFACE_POLICY,
  decideBingoRealtimeReplay,
  decideBingoRealtimeResume,
  parseBingoLastEventId,
} from "./realtime-contract";

describe("Bingo realtime protocol contracts", () => {
  const eventId = "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd";
  const nextEventId = "bfb6f370-39ba-4b1d-863e-cc283a4b4378";
  const cursor = {
    stream: "public:bingo-2026",
    lastEventId: eventId,
    lastSequence: 10,
  };

  it("keeps the realtime catalog in exact parity with transactional outbox v1", () => {
    expect([...BINGO_REALTIME_EVENT_TYPES].sort()).toEqual(
      [...BINGO_OUTBOX_EVENT_TYPES].sort(),
    );
    expect(
      BINGO_REALTIME_EVENT_TYPES.every((type) => type.endsWith(".v1")),
    ).toBe(true);
  });

  it("continues only with the next contiguous stream sequence", () => {
    expect(
      decideBingoRealtimeResume(cursor, {
        id: nextEventId,
        stream: cursor.stream,
        sequence: 11,
      }),
    ).toEqual({
      kind: "CONTINUE",
      acceptSequence: 11,
      acceptEventId: nextEventId,
    });
  });

  it("deduplicates replayed Last-Event-ID data and rejects a conflicting id", () => {
    expect(
      decideBingoRealtimeResume(cursor, {
        id: eventId,
        stream: cursor.stream,
        sequence: 10,
      }),
    ).toEqual({
      kind: "IGNORE_DUPLICATE",
      acceptSequence: 10,
      acceptEventId: eventId,
    });
    expect(
      decideBingoRealtimeResume(cursor, {
        id: nextEventId,
        stream: cursor.stream,
        sequence: 10,
      }),
    ).toMatchObject({ kind: "RESYNC_REQUIRED", reason: "EVENT_ID_CONFLICT" });
  });

  it("requires REST snapshot resync for gaps and stream changes", () => {
    expect(
      decideBingoRealtimeResume(cursor, {
        id: nextEventId,
        stream: cursor.stream,
        sequence: 12,
      }),
    ).toMatchObject({
      kind: "RESYNC_REQUIRED",
      reason: "SEQUENCE_GAP",
      expectedSequence: 11,
      receivedSequence: 12,
    });
    expect(
      decideBingoRealtimeResume(cursor, {
        id: nextEventId,
        stream: "public:other",
        sequence: 11,
      }),
    ).toMatchObject({ kind: "RESYNC_REQUIRED", reason: "STREAM_CHANGED" });
  });

  it("selects snapshot, replay, wait or resync from the retained window", () => {
    const window = {
      stream: cursor.stream,
      earliestRetainedSequence: 6,
      latestSequence: 10,
      latestEventId: eventId,
    };
    expect(decideBingoRealtimeReplay(null, window)).toEqual({
      kind: "SNAPSHOT_REQUIRED",
      reason: "CURSOR_MISSING",
    });
    expect(
      decideBingoRealtimeReplay({ ...cursor, lastSequence: 7 }, window),
    ).toEqual({ kind: "REPLAY", fromSequence: 8 });
    expect(decideBingoRealtimeReplay(cursor, window)).toEqual({
      kind: "WAIT",
      afterSequence: 10,
    });
    expect(
      decideBingoRealtimeReplay({ ...cursor, lastSequence: 4 }, window),
    ).toEqual({ kind: "RESYNC_REQUIRED", reason: "CURSOR_EXPIRED" });
    expect(
      decideBingoRealtimeReplay({ ...cursor, lastSequence: 11 }, window),
    ).toEqual({ kind: "RESYNC_REQUIRED", reason: "CURSOR_AHEAD" });
  });

  it("accepts only a single canonical UUID Last-Event-ID", () => {
    expect(parseBingoLastEventId(undefined)).toBeNull();
    expect(parseBingoLastEventId(eventId.toUpperCase())).toBe(eventId);
    expect(() => parseBingoLastEventId([eventId])).toThrow(
      "BINGO_REALTIME_CONTRACT_INVALID:Last-Event-ID",
    );
    expect(() => parseBingoLastEventId(" cursor ")).toThrow(
      "BINGO_REALTIME_CONTRACT_INVALID:Last-Event-ID",
    );
  });

  it("separates public, affiliate and administrative authorization boundaries", () => {
    expect(BINGO_REALTIME_SURFACE_POLICY.PUBLIC).toMatchObject({
      authentication: "NONE",
      authorization: "EVENT_PUBLIC_REALTIME_ENABLED",
    });
    expect(BINGO_REALTIME_SURFACE_POLICY.AFFILIATE).toMatchObject({
      authentication: "SELF_SERVICE_AFFILIATE",
      authorization: "CURRENT_EVENT_PARTICIPATION",
    });
    expect(BINGO_REALTIME_SURFACE_POLICY.ADMIN).toMatchObject({
      authentication: "ADMIN_SESSION_AND_PERMISSION",
      authorization: "BINGO_READ_OR_OPERATION_PERMISSION",
    });
  });

  it("accepts an allowlisted public draw envelope", () => {
    expect(() =>
      assertBingoRealtimeEnvelope({
        id: eventId,
        type: "bingo.draw.created.v1",
        stream: "public:bingo-2026",
        sequence: 10,
        occurredAt: "2026-08-11T12:00:00.000Z",
        surface: "PUBLIC",
        data: {
          schemaVersion: 1,
          eventSlug: "bingo-2026",
          roundOrder: 1,
          revision: 1,
          drawSequence: 4,
          ball: 51,
          drawnAt: "2026-08-11T12:00:00.000Z",
        },
      }),
    ).not.toThrow();
  });

  it("rejects candidates on non-admin streams and unknown projection fields", () => {
    expect(() =>
      assertBingoRealtimeEnvelope({
        id: eventId,
        type: "bingo.candidate.detected.v1",
        stream: "public:bingo-2026",
        sequence: 10,
        occurredAt: "2026-08-11T12:00:00.000Z",
        surface: "PUBLIC",
        data: {
          schemaVersion: 1,
          candidateId: eventId,
          executionId: eventId,
          patternId: eventId,
          decisiveDrawSequence: 4,
          decisiveBall: 51,
          status: "PENDING",
          occurredAt: "2026-08-11T12:00:00.000Z",
        },
      }),
    ).toThrow("BINGO_REALTIME_CONTRACT_INVALID:surface");

    expect(() =>
      assertBingoRealtimeEnvelope({
        id: eventId,
        type: "bingo.draw.created.v1",
        stream: "public:bingo-2026",
        sequence: 10,
        occurredAt: "2026-08-11T12:00:00.000Z",
        surface: "PUBLIC",
        data: {
          schemaVersion: 1,
          eventSlug: "bingo-2026",
          roundOrder: 1,
          revision: 1,
          drawSequence: 4,
          ball: 51,
          drawnAt: "2026-08-11T12:00:00.000Z",
          unexpected: true,
        },
      }),
    ).toThrow("BINGO_REALTIME_CONTRACT_INVALID:data.unexpected");
  });

  it.each([
    "documentNumber",
    "phone",
    "email",
    "subjectRef",
    "affiliateId",
    "participantId",
    "secretSeed",
    "seed",
    "seedCiphertext",
    "custodyKeyId",
  ])("rejects sensitive realtime field %s recursively", (field) =>
    expect(() =>
      assertBingoRealtimePayloadSafe({
        eventSlug: "safe",
        nested: { [field]: "secret" },
      }),
    ).toThrow("BINGO_REALTIME_CONTRACT_INVALID"),
  );
});
