import { Prisma, PrismaClient } from "@prisma/client";
import { createBingoFixture } from "../../../../database/bingo-test-fixture";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import {
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import type { ExecutionEffectsPort } from "./execution-effects.port";
import { BingoExecutionLifecycleService } from "./execution-lifecycle.service";

describe("Bingo execution lifecycle (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => prisma.$disconnect());

  async function scenario(label: string, failOutbox = false) {
    const fixture = await createBingoFixture(prisma, label);
    const event = await fixture.createEvent(label);
    const configured = await fixture.createConfiguredRound(event.id);
    await prisma.bingoEvent.update({
      where: { id: event.id },
      data: { status: "CONFIGURED" },
    });
    await prisma.bingoEvent.update({
      where: { id: event.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-11T14:00:00.000Z"),
        configurationLockedAt: new Date("2026-08-11T14:00:00.000Z"),
      },
    });
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );
    const now = new Date("2026-08-11T15:00:00.000Z");
    const context: CommandContext = {
      actor: {
        userId: fixture.user.id,
        permissions: new Set(["bingo.operate"]),
      },
      requestId: `request-${label}`,
      idempotencyKey: `key-${label}`,
      idempotencyKeyHash: "a".repeat(64),
      requestHash: "b".repeat(64),
      clock: { now: () => now },
    };
    const runner = {
      transaction: <T>(
        isolationLevel: Prisma.TransactionIsolationLevel,
        work: (tx: Prisma.TransactionClient) => Promise<T>,
      ) => prisma.$transaction(work, { isolationLevel }),
    };
    const effects: ExecutionEffectsPort = {
      appendAudit: async (tx, commandContext, record) => {
        await tx.bingoAuditEvent.create({
          data: {
            eventId: record.eventId,
            roundId: record.roundId,
            executionId: record.executionId,
            actorUserId: commandContext.actor.userId,
            actorPermission: "bingo.operate",
            action: record.action,
            result: record.result,
            requestId: commandContext.requestId,
            idempotencyKeyHash: commandContext.idempotencyKeyHash,
            previousState: record.previousState,
            newState: record.newState,
          },
        });
      },
      appendOutbox: async (tx, record) => {
        if (failOutbox) throw new Error("simulated outbox failure");
        await tx.bingoOutboxEvent.create({
          data: {
            eventId: record.eventId,
            executionId: record.executionId,
            sequence: 1n,
            eventType: record.eventType,
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            aggregateVersion: record.aggregateVersion,
            publicPayload: record.publicPayload,
          },
        });
      },
    };
    return {
      event,
      configured,
      execution,
      context,
      now,
      service: new BingoExecutionLifecycleService(
        new BingoTransactionKernel(runner, undefined, async () => undefined),
        new BingoLockManager(),
        effects,
        { assertCanComplete: async () => undefined },
        {
          resolve: async () => ({
            configurationHash: execution.configurationHash!,
            fairnessProtocolVersion: execution.fairnessProtocolVersion!,
          }),
        },
      ),
    };
  }

  it("commits execution, event, round, audit and outbox atomically", async () => {
    const value = await scenario("kernel-commit");
    await value.service.start(
      {
        eventId: value.event.id,
        roundId: value.configured.round.id,
        executionId: value.execution.id,
        expectedConfigurationVersion: value.execution.configurationVersion,
      },
      value.context,
    );

    const [execution, event, round, audits, outbox] = await Promise.all([
      prisma.bingoRoundExecution.findUniqueOrThrow({
        where: { id: value.execution.id },
      }),
      prisma.bingoEvent.findUniqueOrThrow({ where: { id: value.event.id } }),
      prisma.bingoRound.findUniqueOrThrow({
        where: { id: value.configured.round.id },
      }),
      prisma.bingoAuditEvent.count({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoOutboxEvent.count({
        where: { executionId: value.execution.id },
      }),
    ]);
    expect(execution).toMatchObject({ status: "RUNNING", stateVersion: 1n });
    expect(event.status).toBe("IN_PROGRESS");
    expect(round.status).toBe("IN_PROGRESS");
    expect(audits).toBe(1);
    expect(outbox).toBe(1);
  });

  it("rolls back state and audit if the outbox write fails", async () => {
    const value = await scenario("kernel-rollback", true);
    await expect(
      value.service.start(
        {
          eventId: value.event.id,
          roundId: value.configured.round.id,
          executionId: value.execution.id,
          expectedConfigurationVersion: value.execution.configurationVersion,
        },
        value.context,
      ),
    ).rejects.toThrow("simulated outbox failure");

    const [execution, event, round, audits, outbox] = await Promise.all([
      prisma.bingoRoundExecution.findUniqueOrThrow({
        where: { id: value.execution.id },
      }),
      prisma.bingoEvent.findUniqueOrThrow({ where: { id: value.event.id } }),
      prisma.bingoRound.findUniqueOrThrow({
        where: { id: value.configured.round.id },
      }),
      prisma.bingoAuditEvent.count({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoOutboxEvent.count({
        where: { executionId: value.execution.id },
      }),
    ]);
    expect(execution.status).toBe("PLANNED");
    expect(event.status).toBe("PUBLISHED");
    expect(round.status).toBe("READY");
    expect(audits).toBe(0);
    expect(outbox).toBe(0);
  });
});
