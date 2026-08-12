import { BingoRedisFanoutService } from "./bingo-redis-fanout.service";

describe("BingoRedisFanoutService", () => {
  it("does not connect a subscriber while realtime is disabled", async () => {
    const duplicate = jest.fn();
    const service = new BingoRedisFanoutService(
      { getClient: () => ({ duplicate }) } as never,
      { isEnabled: jest.fn().mockReturnValue(false) } as never,
    );
    await service.onModuleInit();
    expect(duplicate).not.toHaveBeenCalled();
  });

  it("publishes only a bounded non-PII PostgreSQL wake-up signal", async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const service = new BingoRedisFanoutService({
      getClient: () => ({ publish }),
    } as never);
    await service.publish({
      schemaVersion: 1,
      outboxEventId: "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd",
      eventId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
      sequence: 9,
    });
    const serialized = publish.mock.calls[0]?.[1] as string;
    expect(serialized).not.toMatch(/document|phone|email|affiliate|participant|seed/i);
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: 1,
      outboxEventId: "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd",
      eventId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
      sequence: 9,
    });
  });

  it("fails closed for malformed notifications", async () => {
    const service = new BingoRedisFanoutService({
      getClient: () => ({ publish: jest.fn() }),
    } as never);
    await expect(
      service.publish({
        schemaVersion: 1,
        outboxEventId: "bad",
        eventId: "bad",
        sequence: 1,
      }),
    ).rejects.toThrow("invalid notification");
  });
});
