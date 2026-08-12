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
            createdAt: record.occurredAt,
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
            createdAt: record.occurredAt,
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
    const command = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      executionId: value.execution.id,
      expectedConfigurationVersion: value.execution.configurationVersion,
    };
    const first = await value.service.start(command, value.context);
    const replay = await value.service.start(command, value.context);
    expect(replay).toEqual({ ...first, replayed: true });

    const [execution, event, round, audits, outbox, idempotency] =
      await Promise.all([
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
        prisma.bingoCommandIdempotency.count({
          where: { executionId: value.execution.id },
        }),
      ]);
    expect(execution).toMatchObject({ status: "RUNNING", stateVersion: 1n });
    expect(event.status).toBe("IN_PROGRESS");
    expect(round.status).toBe("IN_PROGRESS");
    expect(audits).toBe(1);
    expect(outbox).toBe(1);
    expect(idempotency).toBe(1);
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

    const [execution, event, round, audits, outbox, idempotency] =
      await Promise.all([
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
        prisma.bingoCommandIdempotency.count({
          where: { executionId: value.execution.id },
        }),
      ]);
    expect(execution.status).toBe("PLANNED");
    expect(event.status).toBe("PUBLISHED");
    expect(round.status).toBe("READY");
    expect(audits).toBe(0);
    expect(outbox).toBe(0);
    expect(idempotency).toBe(0);
  });

  it("rejects reuse of the same key with a different canonical request", async () => {
    const value = await scenario("kernel-mismatch");
    const command = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      executionId: value.execution.id,
      expectedConfigurationVersion: value.execution.configurationVersion,
    };
    await value.service.start(command, value.context);
    await expect(
      value.service.start(
        {
          ...command,
          expectedConfigurationVersion:
            value.execution.configurationVersion + 1,
        },
        value.context,
      ),
    ).rejects.toMatchObject({
      code: "BINGO_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
    });
    await expect(
      prisma.bingoCommandIdempotency.count({
        where: { executionId: value.execution.id },
      }),
    ).resolves.toBe(1);
  });

  it("serializes concurrent requests with the same key into one official transition", async () => {
    const value = await scenario("kernel-concurrent");
    const command = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      executionId: value.execution.id,
      expectedConfigurationVersion: value.execution.configurationVersion,
    };
    const attempts = await Promise.allSettled([
      value.service.start(command, value.context),
      value.service.start(command, value.context),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).not.toHaveLength(0);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({
        details: { reason: "BINGO_IDEMPOTENCY_IN_PROGRESS" },
      });
    }
    const [execution, audits, outbox, idempotency] = await Promise.all([
      prisma.bingoRoundExecution.findUniqueOrThrow({
        where: { id: value.execution.id },
      }),
      prisma.bingoAuditEvent.count({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoOutboxEvent.count({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoCommandIdempotency.count({
        where: { executionId: value.execution.id },
      }),
    ]);
    expect(execution).toMatchObject({ status: "RUNNING", stateVersion: 1n });
    expect({ audits, outbox, idempotency }).toEqual({
      audits: 1,
      outbox: 1,
      idempotency: 1,
    });
  });

  it("uses one logical timestamp for state, audit and outbox evidence", async () => {
    const value = await scenario("kernel-logical-time");
    await value.service.start(
      {
        eventId: value.event.id,
        roundId: value.configured.round.id,
        executionId: value.execution.id,
        expectedConfigurationVersion: value.execution.configurationVersion,
      },
      value.context,
    );
    const [execution, audit, outbox] = await Promise.all([
      prisma.bingoRoundExecution.findUniqueOrThrow({
        where: { id: value.execution.id },
      }),
      prisma.bingoAuditEvent.findFirstOrThrow({
        where: { executionId: value.execution.id },
      }),
      prisma.bingoOutboxEvent.findFirstOrThrow({
        where: { executionId: value.execution.id },
      }),
    ]);
    expect(execution.startedAt).toEqual(value.now);
    expect(audit.createdAt).toEqual(value.now);
    expect(outbox.createdAt).toEqual(value.now);
  });
});
