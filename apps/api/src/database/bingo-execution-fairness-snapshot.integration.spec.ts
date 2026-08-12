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
});
