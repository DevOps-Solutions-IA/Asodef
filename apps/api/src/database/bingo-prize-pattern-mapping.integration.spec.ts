import { PrismaClient } from "@prisma/client";
import { createBingoFixture } from "./bingo-test-fixture";
import { createTestPrismaClient } from "./test-db-client";

describe("Bingo prize to pattern mapping (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  it("rejects a prize mapped to a pattern from another round", async () => {
    const fixture = await createBingoFixture(prisma, "prize-cross-round");
    const event = await fixture.createEvent("prize-cross-round");
    const firstRound = await prisma.bingoRound.create({
      data: {
        eventId: event.id,
        sequence: 1,
        name: "First",
        validationPolicy: "SIMPLE",
        tiePolicy: "SPLIT_PRIZE",
        createdByUserId: fixture.user.id,
      },
    });
    const secondRound = await prisma.bingoRound.create({
      data: {
        eventId: event.id,
        sequence: 2,
        name: "Second",
        validationPolicy: "SIMPLE",
        tiePolicy: "SPLIT_PRIZE",
        createdByUserId: fixture.user.id,
      },
    });
    const pattern = await prisma.bingoPattern.create({
      data: {
        eventId: event.id,
        code: "cross-round-line",
        name: "Line",
        kind: "LINE",
      },
    });
    const secondRoundPattern = await prisma.bingoRoundPattern.create({
      data: {
        eventId: event.id,
        roundId: secondRound.id,
        patternId: pattern.id,
        sequence: 1,
      },
    });

    await expect(
      prisma.bingoPrize.create({
        data: {
          eventId: event.id,
          roundId: firstRound.id,
          roundPatternId: secondRoundPattern.id,
          patternId: pattern.id,
          sequence: 1,
          name: "Invalid cross-round prize",
          kind: "IN_KIND",
        },
      }),
    ).rejects.toBeDefined();
  });

  it("fails closed when an execution starts with an unmapped prize", async () => {
    const fixture = await createBingoFixture(prisma, "prize-unmapped");
    const event = await fixture.createEvent("prize-unmapped");
    const round = await prisma.bingoRound.create({
      data: {
        eventId: event.id,
        sequence: 1,
        name: "Unmapped",
        validationPolicy: "SIMPLE",
        tiePolicy: "SPLIT_PRIZE",
        createdByUserId: fixture.user.id,
      },
    });
    await prisma.bingoPrize.create({
      data: {
        eventId: event.id,
        roundId: round.id,
        sequence: 1,
        name: "Still unmapped",
        kind: "IN_KIND",
      },
    });
    const lockedRound = await prisma.bingoRound.update({
      where: { id: round.id },
      data: { status: "READY", configurationLockedAt: new Date() },
    });
    const execution = await fixture.createExecution(event.id, lockedRound.id);

    await expect(
      prisma.bingoRoundExecution.update({
        where: { id: execution.id },
        data: {
          status: "RUNNING",
          operatorUserId: fixture.user.id,
          startedAt: new Date(),
        },
      }),
    ).rejects.toBeDefined();
  });
});
