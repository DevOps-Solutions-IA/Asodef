import { Subject } from "rxjs";
import type { BingoRealtimeEnvelopeContract } from "../contracts/realtime";
import { BingoRealtimeStreamService } from "./bingo-realtime-stream.service";
import type { BingoOutboxNotification } from "./bingo-realtime.types";

const EVENT_ID = "bfb6f370-39ba-4b1d-863e-cc283a4b4378";
const OUTBOX_ID = "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd";
const NEXT_ID = "88de2e20-6af1-4933-b491-00898945a161";
const access = {
  eventId: EVENT_ID,
  eventSlug: "asodef-2026",
  surface: "PUBLIC" as const,
  winnerDisplayNameAllowed: false,
};

function envelope(sequence: number): BingoRealtimeEnvelopeContract {
  return {
    id: NEXT_ID,
    type: "bingo.draw.created.v1",
    stream: "public:asodef-2026",
    sequence,
    occurredAt: "2026-08-11T12:00:00.000Z",
    surface: "PUBLIC",
    data: {
      schemaVersion: 1,
      eventSlug: "asodef-2026",
      roundOrder: 1,
      revision: 1,
      drawSequence: 1,
      ball: 7,
      drawnAt: "2026-08-11T12:00:00.000Z",
    },
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("BingoRealtimeStreamService", () => {
  it("subscribes before snapshot cursor resolution and catches a racing Redis signal from PostgreSQL", async () => {
    const signals = new Subject<BingoOutboxNotification>();
    let resolveLatest!: (value: { stream: string; lastEventId: string; lastSequence: number }) => void;
    const repository = {
      stream: () => "public:asodef-2026",
      latestCursor: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveLatest = resolve;
          }),
      ),
      projectedAfter: jest.fn().mockResolvedValue([envelope(6)]),
      resolveCursor: jest.fn(),
    };
    const service = new BingoRealtimeStreamService(repository as never, {
      observe: () => signals,
    } as never);
    const messages: unknown[] = [];
    const subscription = service
      .open(access, null, "/snapshot")
      .subscribe((message) => messages.push(message));
    signals.next({ schemaVersion: 1, outboxEventId: OUTBOX_ID, eventId: EVENT_ID, sequence: 6 });
    resolveLatest({ stream: "public:asodef-2026", lastEventId: OUTBOX_ID, lastSequence: 5 });
    await flush();
    await flush();
    expect(messages).toEqual([
      expect.objectContaining({
        type: "bingo.resync.v1",
        data: expect.objectContaining({ kind: "SNAPSHOT_REQUIRED", latestSequence: 5 }),
      }),
      expect.objectContaining({ id: NEXT_ID, type: "bingo.draw.created.v1" }),
    ]);
    subscription.unsubscribe();
  });

  it("bounds replay and forces authoritative resync instead of buffering an unbounded slow client", async () => {
    const signals = new Subject<BingoOutboxNotification>();
    const repository = {
      stream: () => "public:asodef-2026",
      resolveCursor: jest.fn().mockResolvedValue({
        stream: "public:asodef-2026",
        lastEventId: OUTBOX_ID,
        lastSequence: 1,
      }),
      latestCursor: jest.fn().mockResolvedValue({
        stream: "public:asodef-2026",
        lastEventId: NEXT_ID,
        lastSequence: 400,
      }),
      projectedAfter: jest
        .fn()
        .mockResolvedValue(Array.from({ length: 257 }, (_, index) => envelope(index + 2))),
    };
    const service = new BingoRealtimeStreamService(repository as never, {
      observe: () => signals,
    } as never);
    const messages: Array<{ type?: string; data?: unknown }> = [];
    const subscription = service
      .open(access, OUTBOX_ID, "/snapshot")
      .subscribe((message) => messages.push(message));
    await flush();
    await flush();
    expect(messages).toEqual([
      expect.objectContaining({
        type: "bingo.resync.v1",
        data: expect.objectContaining({
          reason: "REPLAY_WINDOW_EXCEEDED",
          latestSequence: 400,
        }),
      }),
    ]);
    subscription.unsubscribe();
  });

  it("ignores Redis notifications for other events", async () => {
    const signals = new Subject<BingoOutboxNotification>();
    const repository = {
      stream: () => "public:asodef-2026",
      resolveCursor: jest.fn().mockResolvedValue({
        stream: "public:asodef-2026",
        lastEventId: OUTBOX_ID,
        lastSequence: 3,
      }),
      latestCursor: jest.fn(),
      projectedAfter: jest.fn().mockResolvedValue([]),
    };
    const service = new BingoRealtimeStreamService(repository as never, {
      observe: () => signals,
    } as never);
    const subscription = service.open(access, OUTBOX_ID, "/snapshot").subscribe();
    await flush();
    repository.projectedAfter.mockClear();
    signals.next({
      schemaVersion: 1,
      outboxEventId: NEXT_ID,
      eventId: "47e17c41-3014-4162-bf25-aed0677fc445",
      sequence: 4,
    });
    await flush();
    expect(repository.projectedAfter).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
