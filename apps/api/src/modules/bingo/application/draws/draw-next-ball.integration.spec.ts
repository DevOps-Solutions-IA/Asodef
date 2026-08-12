import { Prisma, PrismaClient } from "@prisma/client";
import { createBingoFixture } from "../../../../database/bingo-test-fixture";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import { PrismaBingoAuditRepository } from "../audit";
import { BINGO_DRAW_EVIDENCE_VERSION, type BallSelector } from "../fairness";
import { PrismaBingoIdempotencyRepository } from "../idempotency";
import {
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import { PrismaBingoOutboxRepository } from "../outbox";
import {
  DrawNextBallService,
  type DrawTransactionCheckpoint,
} from "./draw-next-ball.service";

describe("DrawNextBall (integration, real PostgreSQL)", () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });
  afterAll(async () => prisma.$disconnect());

  async function scenario(label: string, withCard = false) {
    const fixture = await createBingoFixture(prisma, label);
    const event = await fixture.createEvent(label);
    const configured = await fixture.createConfiguredRound(event.id);
    if (withCard) {
      const participant = await fixture.createAffiliateParticipant(event.id);
      const card = await fixture.createCard(event.id);
      await fixture.assignCard(event.id, card.id, participant.id);
    }
    await prisma.bingoEvent.update({
      where: { id: event.id },
      data: { status: "CONFIGURED" },
    });
    await prisma.bingoEvent.update({
      where: { id: event.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        configurationLockedAt: new Date(),
      },
    });
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );
    await prisma.bingoRoundExecution.update({
      where: { id: execution.id },
      data: {
        status: "RUNNING",
        operatorUserId: fixture.user.id,
        startedAt: new Date(),
      },
    });
    await prisma.bingoRound.update({
      where: { id: configured.round.id },
      data: { status: "IN_PROGRESS" },
    });
    await prisma.bingoEvent.update({
      where: { id: event.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    const command = {
      eventId: event.id,
      roundId: configured.round.id,
      executionId: execution.id,
    };
    const context = (key: string): CommandContext => ({
      actor: {
        userId: fixture.user.id,
        permissions: new Set(["bingo.operate"]),
      },
      requestId: `request-${key}`,
      idempotencyKey: `${key}-idempotency-key`,
      idempotencyKeyHash: "a".repeat(64),
      requestHash: "b".repeat(64),
      clock: { now: () => new Date() },
    });
    const selector: BallSelector = {
      selectBall: (available) => {
        const decisiveLine = [1, 16, 31, 46, 61];
        const target = withCard
          ? (decisiveLine[75 - available.length] ?? available[0]!)
          : available[0]!;
        return {
          ball: target,
          evidence: {
            evidenceVersion: BINGO_DRAW_EVIDENCE_VERSION,
            fairnessMode: "CRYPTO_RNG",
            algorithmId: "integration-deterministic-v1",
            availableBallCount: available.length,
            availableBallsHash: "a".repeat(64),
            selectedIndex: available.indexOf(target),
          },
        };
      },
    };
    const service = (checkpoint?: DrawTransactionCheckpoint) =>
      new DrawNextBallService(
        new BingoTransactionKernel(
          {
            transaction: <T>(
              isolationLevel: Prisma.TransactionIsolationLevel,
              work: (tx: Prisma.TransactionClient) => Promise<T>,
            ) =>
              prisma.$transaction(work, {
                isolationLevel,
                maxWait: 20_000,
                timeout: 30_000,
              }),
          },
          undefined,
          async () => undefined,
        ),
        new BingoLockManager(),
        new PrismaBingoIdempotencyRepository(),
        new PrismaBingoAuditRepository(),
        new PrismaBingoOutboxRepository(),
        selector,
        checkpoint === undefined
          ? undefined
          : {
              checkpoint: async (value) => {
                if (value === checkpoint)
                  throw new Error(`crash:${checkpoint}`);
              },
            },
      );
    return { event, configured, execution, command, context, service };
  }

  it("makes twenty concurrent retries with one key produce exactly one draw", async () => {
    const value = await scenario("same-key");
    const settled = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        value.service().execute(value.command, value.context("same-key")),
      ),
    );
    expect(
      await prisma.bingoDraw.count({
        where: { executionId: value.execution.id },
      }),
    ).toBe(1);
    expect(settled.some((item) => item.status === "fulfilled")).toBe(true);
    const replay = await value
      .service()
      .execute(value.command, value.context("same-key"));
    expect(replay).toMatchObject({
      sequence: 1,
      ballNumber: 1,
      candidateCount: 0,
    });
  });

  it("serializes twenty distinct keys into contiguous unique draws", async () => {
    const value = await scenario("different-keys");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        value.service().execute(value.command, value.context(`key-${index}`)),
      ),
    );
    expect(new Set(results.map((item) => item.ballNumber)).size).toBe(20);
    expect(results.map((item) => item.sequence).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it("fails deterministically after the seventy-fifth contiguous draw", async () => {
    const value = await scenario("exhaustion");
    for (let index = 1; index <= 75; index += 1)
      await value
        .service()
        .execute(value.command, value.context(`draw-${index}`));
    await expect(
      value.service().execute(value.command, value.context("draw-76")),
    ).rejects.toMatchObject({ code: "BINGO_NO_BALLS_REMAINING" });
    const draws = await prisma.bingoDraw.findMany({
      where: { executionId: value.execution.id },
      orderBy: { sequence: "asc" },
    });
    expect(draws.map((draw) => draw.sequence)).toEqual(
      Array.from({ length: 75 }, (_, index) => index + 1),
    );
    expect(new Set(draws.map((draw) => draw.ballNumber)).size).toBe(75);
  });

  it.each([
    "AFTER_DRAW",
    "AFTER_CANDIDATES",
    "AFTER_AUDIT",
    "AFTER_OUTBOX",
  ] as const)(
    "rolls back every artifact on injected crash %s",
    async (checkpoint) => {
      const labelByCheckpoint = {
        AFTER_DRAW: "rollback-draw",
        AFTER_CANDIDATES: "rollback-candidates",
        AFTER_AUDIT: "rollback-audit",
        AFTER_OUTBOX: "rollback-outbox",
      } as const;
      const value = await scenario(labelByCheckpoint[checkpoint]);
      await expect(
        value
          .service(checkpoint)
          .execute(value.command, value.context(`failure-${checkpoint}`)),
      ).rejects.toThrow(`crash:${checkpoint}`);
      const [draws, commands, audits, outbox, execution] = await Promise.all([
        prisma.bingoDraw.count({ where: { executionId: value.execution.id } }),
        prisma.bingoCommandIdempotency.count({
          where: { executionId: value.execution.id },
        }),
        prisma.bingoAuditEvent.count({
          where: { executionId: value.execution.id },
        }),
        prisma.bingoOutboxEvent.count({
          where: { executionId: value.execution.id },
        }),
        prisma.bingoRoundExecution.findUniqueOrThrow({
          where: { id: value.execution.id },
        }),
      ]);
      expect({
        draws,
        commands,
        audits,
        outbox,
        stateVersion: execution.stateVersion,
      }).toEqual({
        draws: 0,
        commands: 0,
        audits: 0,
        outbox: 0,
        stateVersion: 0n,
      });
    },
  );

  it("commits decisive draw and every candidate atomically", async () => {
    const value = await scenario("candidate-atomic", true);
    for (let index = 1; index <= 5; index += 1)
      await value
        .service()
        .execute(value.command, value.context(`candidate-${index}`));
    const [draws, groups, candidates] = await Promise.all([
      prisma.bingoDraw.count({ where: { executionId: value.execution.id } }),
      prisma.bingoWinGroup.count({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoWinnerCandidate.count({
        where: { executionId: value.execution.id },
      }),
    ]);
    expect({ draws, groups, candidates }).toEqual({
      draws: 5,
      groups: 1,
      candidates: 1,
    });
  });

  it("rolls back the decisive draw and candidate together after candidate persistence", async () => {
    const value = await scenario("candidate-rollback", true);
    for (let index = 1; index <= 4; index += 1) {
      await value
        .service()
        .execute(value.command, value.context(`candidate-pre-${index}`));
    }
    await expect(
      value
        .service("AFTER_CANDIDATES")
        .execute(value.command, value.context("candidate-failing-fifth")),
    ).rejects.toThrow("crash:AFTER_CANDIDATES");
    const [draws, groups, candidates] = await Promise.all([
      prisma.bingoDraw.count({ where: { executionId: value.execution.id } }),
      prisma.bingoWinGroup.count({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoWinnerCandidate.count({
        where: { executionId: value.execution.id },
      }),
    ]);
    expect({ draws, groups, candidates }).toEqual({
      draws: 4,
      groups: 0,
      candidates: 0,
    });
  });
});
