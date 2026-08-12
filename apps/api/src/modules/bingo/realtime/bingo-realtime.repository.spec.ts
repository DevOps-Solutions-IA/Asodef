import { BingoRealtimeRepository } from "./bingo-realtime.repository";

describe("BingoRealtimeRepository projections", () => {
  it("derives a contiguous public ordinal while excluding admin-only candidates", async () => {
    const prisma = {
      bingoOutboxEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd", sequence: 4n }),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const repository = new BingoRealtimeRepository(prisma as never);
    await expect(
      repository.resolveCursor(
        {
          eventId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
          eventSlug: "asodef-2026",
          surface: "PUBLIC",
          winnerDisplayNameAllowed: false,
        },
        "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd",
      ),
    ).resolves.toMatchObject({ lastSequence: 3 });
    const where = prisma.bingoOutboxEvent.findFirst.mock.calls[0]?.[0]?.where;
    expect(where.eventType.in).not.toContain("bingo.candidate.detected.v1");
    expect(where.eventType.in).toContain("bingo.draw.created.v1");
  });

  it("projects a public draw from an allowlist and never forwards its raw JSON", async () => {
    const prisma = {
      bingoOutboxEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd",
            eventType: "bingo.draw.created.v1",
            aggregateId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
            publicPayload: {
              schemaVersion: 1,
              drawId: "965de6cb-dd2f-414b-84a4-164d1e06eb71",
              executionId: "4929b096-a5bb-4a8f-a7a8-26a752bd5991",
              roundId: "47e17c41-3014-4162-bf25-aed0677fc445",
              sequence: 9,
              ballNumber: 42,
              stateVersion: 9,
              drawnAt: "2026-08-11T12:00:00.000Z",
            },
            createdAt: new Date("2026-08-11T12:00:00.000Z"),
            execution: {
              id: "4929b096-a5bb-4a8f-a7a8-26a752bd5991",
              revision: 2,
              round: { id: "47e17c41-3014-4162-bf25-aed0677fc445", sequence: 1 },
            },
          },
        ]),
      },
    };
    const repository = new BingoRealtimeRepository(prisma as never);
    const [event] = await repository.projectedAfter(
      {
        eventId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
        eventSlug: "asodef-2026",
        surface: "PUBLIC",
        winnerDisplayNameAllowed: false,
      },
      2,
      10,
    );
    expect(event).toEqual({
      id: "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd",
      type: "bingo.draw.created.v1",
      stream: "public:asodef-2026",
      sequence: 3,
      occurredAt: "2026-08-11T12:00:00.000Z",
      surface: "PUBLIC",
      data: {
        schemaVersion: 1,
        eventSlug: "asodef-2026",
        roundOrder: 1,
        revision: 2,
        drawSequence: 9,
        ball: 42,
        drawnAt: "2026-08-11T12:00:00.000Z",
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/executionId|roundId|drawId|stateVersion/);
  });

  it("honors CARD_ONLY winner privacy even when the evidence snapshot has extra fields", async () => {
    const prisma = {
      bingoOutboxEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "963c4a0b-75a6-4a26-9df8-5c5e9f2920cd",
            eventType: "bingo.winner.confirmed.v1",
            aggregateId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
            publicPayload: {
              schemaVersion: 1,
              winnerId: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
              executionId: "4929b096-a5bb-4a8f-a7a8-26a752bd5991",
              status: "CONFIRMED",
              occurredAt: "2026-08-11T12:00:00.000Z",
            },
            createdAt: new Date("2026-08-11T12:00:00.000Z"),
            execution: {
              id: "4929b096-a5bb-4a8f-a7a8-26a752bd5991",
              revision: 1,
              round: { id: "47e17c41-3014-4162-bf25-aed0677fc445", sequence: 2 },
            },
          },
        ]),
      },
      bingoWinner: {
        findUnique: jest.fn().mockResolvedValue({
          id: "bfb6f370-39ba-4b1d-863e-cc283a4b4378",
          publicDisplaySnapshot: {
            cardNumber: 18,
            displayName: "A*** B***",
            phone: "must-never-cross",
          },
          validatedAt: new Date("2026-08-11T12:00:00.000Z"),
          createdAt: new Date("2026-08-11T11:59:00.000Z"),
        }),
      },
    };
    const repository = new BingoRealtimeRepository(prisma as never);
    const [event] = await repository.projectedAfter(
      {
        eventId: "a123c8bb-e8a1-43aa-93f8-f4d47910b3ec",
        eventSlug: "asodef-2026",
        surface: "PUBLIC",
        winnerDisplayNameAllowed: false,
      },
      0,
      10,
    );
    expect(event?.data).toEqual({
      schemaVersion: 1,
      eventSlug: "asodef-2026",
      roundOrder: 2,
      cardNumber: 18,
      confirmedAt: "2026-08-11T12:00:00.000Z",
    });
    expect(JSON.stringify(event)).not.toMatch(/phone|must-never-cross|displayName/);
  });
});
