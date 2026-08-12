import { BingoOutboxStatus } from "@prisma/client";
import { BingoOutboxPublisherService } from "./bingo-outbox-publisher.service";

const OUTBOX_ID = "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd";
const EVENT_ID = "bfb6f370-39ba-4b1d-863e-cc283a4b4378";

function harness(publish: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  const update = jest.fn().mockResolvedValue({});
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce([
      {
        id: OUTBOX_ID,
        event_id: EVENT_ID,
        sequence: 7n,
        event_type: "bingo.draw.created.v1",
        attempt_count: 0,
      },
    ])
    .mockResolvedValueOnce([]);
  const tx = { $queryRaw: queryRaw, bingoOutboxEvent: { update } };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new BingoOutboxPublisherService(
    prisma as never,
    { publish } as never,
  );
  return { service, publish, update };
}

describe("BingoOutboxPublisherService", () => {
  it("claims with the transaction and marks published only after Redis accepts the signal", async () => {
    const { service, publish, update } = harness();
    await expect(service.publishReadyBatch(5, new Date("2026-08-11T12:00:00.000Z"))).resolves.toBe(1);
    expect(publish).toHaveBeenCalledWith({
      schemaVersion: 1,
      outboxEventId: OUTBOX_ID,
      eventId: EVENT_ID,
      sequence: 7,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OUTBOX_ID },
        data: expect.objectContaining({ status: BingoOutboxStatus.PUBLISHED }),
      }),
    );
  });

  it("persists bounded retry metadata when Redis is unavailable", async () => {
    const { service, update } = harness(
      jest.fn().mockRejectedValue(new Error("redis unavailable: private detail")),
    );
    await expect(service.publishReadyBatch(1, new Date("2026-08-11T12:00:00.000Z"))).resolves.toBe(0);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BingoOutboxStatus.FAILED,
          attemptCount: 1,
          nextAttemptAt: new Date("2026-08-11T12:00:02.000Z"),
        }),
      }),
    );
  });

  it("rejects unbounded batches", async () => {
    const { service } = harness();
    await expect(service.publishReadyBatch(101)).rejects.toThrow(
      "BINGO_OUTBOX_INVALID_BATCH_SIZE",
    );
  });
});
