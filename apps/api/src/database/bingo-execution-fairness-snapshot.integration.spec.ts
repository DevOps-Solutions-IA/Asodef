import { PrismaClient } from "@prisma/client";
import { createBingoFixture, sha256 } from "./bingo-test-fixture";
import { createTestPrismaClient } from "./test-db-client";

describe("Bingo execution fairness snapshot (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  it("persists a versioned configuration hash on each new execution", async () => {
    const fixture = await createBingoFixture(prisma, "fairness-snapshot");
    const event = await fixture.createEvent("fairness-snapshot");
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );

    expect(execution.configurationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(execution.fairnessProtocolVersion).toBe(
      "asodef-bingo-crypto-rng-v1",
    );
  });

  it("fails closed when a legacy PLANNED row tries to start without a snapshot", async () => {
    const fixture = await createBingoFixture(prisma, "fairness-missing");
    const event = await fixture.createEvent("fairness-missing");
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await prisma.bingoRoundExecution.create({
      data: {
        eventId: event.id,
        roundId: configured.round.id,
        revision: 1,
        validationPolicySnapshot: "SIMPLE",
        tiePolicySnapshot: "SPLIT_PRIZE",
        fairnessModeSnapshot: "CRYPTO_RNG",
        configurationVersion: 1,
        createdByUserId: fixture.user.id,
      },
    });

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

  it("accepts one complete snapshot assignment and then makes it immutable", async () => {
    const fixture = await createBingoFixture(prisma, "fairness-immutable");
    const event = await fixture.createEvent("fairness-immutable");
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await prisma.bingoRoundExecution.create({
      data: {
        eventId: event.id,
        roundId: configured.round.id,
        revision: 1,
        validationPolicySnapshot: "SIMPLE",
        tiePolicySnapshot: "SPLIT_PRIZE",
        fairnessModeSnapshot: "CRYPTO_RNG",
        configurationVersion: 1,
        createdByUserId: fixture.user.id,
      },
    });
    const configurationHash = sha256("locked-configuration-v1");

    const snapshotted = await prisma.bingoRoundExecution.update({
      where: { id: execution.id },
      data: {
        configurationHash,
        fairnessProtocolVersion: "asodef-bingo-crypto-rng-v1",
      },
    });
    expect(snapshotted.configurationHash).toBe(configurationHash);

    await expect(
      prisma.bingoRoundExecution.update({
        where: { id: execution.id },
        data: { configurationHash: sha256("different-configuration") },
      }),
    ).rejects.toBeDefined();
  });

  it("rejects malformed hashes and partial snapshots", async () => {
    const fixture = await createBingoFixture(prisma, "fairness-invalid");
    const event = await fixture.createEvent("fairness-invalid");
    const configured = await fixture.createConfiguredRound(event.id);

    await expect(
      fixture.createExecution(event.id, configured.round.id, {
        configurationHash: "not-a-sha256",
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.bingoRoundExecution.create({
        data: {
          eventId: event.id,
          roundId: configured.round.id,
          revision: 2,
          validationPolicySnapshot: "SIMPLE",
          tiePolicySnapshot: "SPLIT_PRIZE",
          fairnessModeSnapshot: "CRYPTO_RNG",
          configurationVersion: 1,
          configurationHash: sha256("partial-snapshot"),
          createdByUserId: fixture.user.id,
        },
      }),
    ).rejects.toBeDefined();
  });

  it("rejects RUNNING when an eligible card lacks its precalculated pattern masks", async () => {
    const fixture = await createBingoFixture(prisma, "mask-coverage-missing");
    const event = await fixture.createEvent("mask-coverage-missing");
    const configured = await fixture.createConfiguredRound(event.id);
    const participant = await fixture.createAffiliateParticipant(event.id);
    const displayNumber = `MISSING-${Date.now()}`;
    const card = await prisma.bingoCard.create({
      data: {
        eventId: event.id,
        displayNumber,
        numbers: [
          1, 16, 31, 46, 61, 2, 17, 32, 47, 62, 3, 18, 0, 48, 63, 4,
          19, 34, 49, 64, 5, 20, 35, 50, 65,
        ],
        layoutHash: sha256(`${event.id}:${displayNumber}`),
      },
    });
    await fixture.assignCard(event.id, card.id, participant.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );

    await expect(
      prisma.bingoRoundExecution.update({
        where: { id: execution.id },
        data: {
          status: "RUNNING",
          operatorUserId: fixture.user.id,
          startedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/BINGO_CARD_PATTERN_MASKS_INCOMPLETE/);
  });

  it("allows RUNNING after every eligible card has the complete mask set", async () => {
    const fixture = await createBingoFixture(prisma, "mask-coverage-ready");
    const event = await fixture.createEvent("mask-coverage-ready");
    const configured = await fixture.createConfiguredRound(event.id);
    const participant = await fixture.createAffiliateParticipant(event.id);
    const card = await fixture.createCard(event.id);
    await fixture.assignCard(event.id, card.id, participant.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );

    const running = await prisma.bingoRoundExecution.update({
      where: { id: execution.id },
      data: {
        status: "RUNNING",
        operatorUserId: fixture.user.id,
        startedAt: new Date(),
      },
    });

    expect(running.status).toBe("RUNNING");
  });
});
