import { NotFoundException } from "@nestjs/common";
import { BingoPublicReadService } from "./bingo-public-read.service";

describe("BingoPublicReadService privacy boundary", () => {
  const prisma = { bingoEvent: { findFirst: jest.fn() } };
  const service = new BingoPublicReadService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("uses an explicit PUBLIC visibility predicate and hides unavailable events", async () => {
    prisma.bingoEvent.findFirst.mockResolvedValue(null);
    await expect(service.getEvent("private-event")).rejects.toEqual(
      new NotFoundException("Bingo no encontrado."),
    );
    expect(prisma.bingoEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: "PUBLIC" }),
      }),
    );
  });

  it("never returns a seed until reveal is committed", async () => {
    prisma.bingoEvent.findFirst.mockResolvedValue({
      id: "internal-event-id",
      slug: "public-event",
      publicWinnerVisibility: "CARD_ONLY",
      rounds: [
        {
          sequence: 1,
          name: "Línea",
          status: "IN_PROGRESS",
          updatedAt: new Date("2026-08-11T12:00:00.000Z"),
          executions: [
            {
              id: "internal-execution-id",
              updatedAt: new Date("2026-08-11T12:00:00.000Z"),
              draws: [],
              fairness: {
                protocolVersion: "asodef-v1",
                commitmentHash: "a".repeat(64),
                publishedAt: new Date("2026-08-11T11:00:00.000Z"),
                revealedSeed: "custodied-but-not-revealed",
                revealedAt: null,
              },
              winGroups: [],
            },
          ],
        },
      ],
    });
    const snapshot = await service.getSnapshot("public-event");
    expect(snapshot.fairness).toEqual({
      protocolVersion: "asodef-v1",
      commitment: "a".repeat(64),
    });
    expect(JSON.stringify(snapshot)).not.toContain("internal-event-id");
    expect(JSON.stringify(snapshot)).not.toContain("internal-execution-id");
    expect(JSON.stringify(snapshot)).not.toContain("custodied-but-not-revealed");
  });

  it("reveals only the explicit public seed after revealedAt", async () => {
    prisma.bingoEvent.findFirst.mockResolvedValue({
      id: "id",
      slug: "revealed-event",
      publicWinnerVisibility: "CARD_ONLY",
      rounds: [
        {
          sequence: 1,
          name: "Línea",
          status: "COMPLETED",
          updatedAt: new Date("2026-08-11T12:00:00.000Z"),
          executions: [
            {
              id: "execution",
              updatedAt: new Date("2026-08-11T12:00:00.000Z"),
              draws: [],
              fairness: {
                protocolVersion: "asodef-v1",
                commitmentHash: "b".repeat(64),
                publishedAt: new Date("2026-08-11T11:00:00.000Z"),
                revealedSeed: "public-seed",
                revealedAt: new Date("2026-08-11T12:00:00.000Z"),
              },
              winGroups: [],
            },
          ],
        },
      ],
    });
    expect((await service.getSnapshot("revealed-event")).fairness).toEqual({
      protocolVersion: "asodef-v1",
      commitment: "b".repeat(64),
      revealedSeed: "public-seed",
      revealedAt: "2026-08-11T12:00:00.000Z",
    });
  });
});
