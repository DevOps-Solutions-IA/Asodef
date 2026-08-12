import { randomUUID } from "node:crypto";
import {
  Prisma,
  type BingoValidationPolicy,
  type PrismaClient,
} from "@prisma/client";

import { createBingoFixture } from "../../../../database/bingo-test-fixture";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import { hashIdempotencyKey, hashIdempotencyRequest } from "../idempotency";
import {
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import { BingoRestartErrorCode } from "./restart-errors";
import {
  BINGO_RESTART_AUDIT_ACTION,
  BingoRestartExecutionService,
  type RestartExecutionCommand,
  type RestartFailurePoint,
} from "./restart-execution.service";

describe("Bingo restart execution (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let concurrentPrisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    concurrentPrisma = createTestPrismaClient();
    await Promise.all([prisma.$connect(), concurrentPrisma.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]);
  });

  function service(client: PrismaClient, failAt?: RestartFailurePoint) {
    return new BingoRestartExecutionService(
      new BingoTransactionKernel(
        {
          transaction: <T>(
            isolationLevel: Prisma.TransactionIsolationLevel,
            work: (tx: Prisma.TransactionClient) => Promise<T>,
          ) => client.$transaction(work, { isolationLevel }),
        },
        undefined,
        async () => undefined,
      ),
      new BingoLockManager(),
      undefined,
      undefined,
      undefined,
      {
        inject: async (point) => {
          if (point === failAt) throw new Error(`injected-restart-${point}`);
        },
      },
    );
  }

  function request(command: RestartExecutionCommand) {
    return {
      eventId: command.eventId,
      previousExecutionId: command.previousExecutionId,
      reason: command.reason.trim(),
      roundId: command.roundId,
      ...(command.supervisorApproval === undefined
        ? {}
        : {
            supervisorApproval: {
              approvedAt: command.supervisorApproval.approvedAt,
              reference: command.supervisorApproval.reference.trim(),
              supervisorUserId: command.supervisorApproval.supervisorUserId,
            },
          }),
    };
  }

  function context(
    actorUserId: string,
    command: RestartExecutionCommand,
    key: string,
    now = new Date("2026-08-11T18:00:00.000Z"),
    permissions: readonly string[] = ["bingo.manage"],
  ): CommandContext {
    return {
      actor: { userId: actorUserId, permissions: new Set(permissions) },
      requestId: randomUUID(),
      idempotencyKey: key,
      idempotencyKeyHash: hashIdempotencyKey(key),
      requestHash: hashIdempotencyRequest(request(command)),
      clock: { now: () => now },
    };
  }

  async function scenario(
    label: string,
    validationPolicy: BingoValidationPolicy = "SIMPLE",
  ) {
    const fixture = await createBingoFixture(prisma, label);
    const event = await fixture.createEvent(label, { validationPolicy });
    const configured = await fixture.createConfiguredRound(event.id, {
      validationPolicy,
    });
    const previous = await fixture.createExecution(
      event.id,
      configured.round.id,
      { validationPolicy },
    );
    const cancelledAt = new Date("2026-08-11T17:00:00.000Z");
    await prisma.bingoRoundExecution.update({
      where: { id: previous.id },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancelReason: "Operational restart required",
      },
    });
    return { fixture, event, configured, previous, cancelledAt };
  }

  it("creates one immutable successor with copied snapshots and atomic evidence", async () => {
    const value = await scenario("restart-atomic");
    const command: RestartExecutionCommand = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      previousExecutionId: value.previous.id,
      reason: "Restart after an audited cancellation",
    };
    const result = await service(prisma).restart(
      command,
      context(value.fixture.user.id, command, "restart-atomic-key-0001"),
    );

    const [previous, created, audits, outbox, idempotency, draws] =
      await Promise.all([
        prisma.bingoRoundExecution.findUniqueOrThrow({
          where: { id: value.previous.id },
        }),
        prisma.bingoRoundExecution.findUniqueOrThrow({
          where: { id: result.executionId },
        }),
        prisma.bingoAuditEvent.findMany({
          where: { executionId: result.executionId },
        }),
        prisma.bingoOutboxEvent.findMany({
          where: { executionId: result.executionId },
        }),
        prisma.bingoCommandIdempotency.findMany({
          where: { eventId: value.event.id, operation: "RESTART_EXECUTION" },
        }),
        prisma.bingoDraw.count({ where: { executionId: result.executionId } }),
      ]);
    expect(previous).toMatchObject({
      status: "CANCELLED",
      revision: 1,
      cancelReason: "Operational restart required",
      cancelledAt: value.cancelledAt,
    });
    expect(created).toMatchObject({
      status: "PLANNED",
      revision: 2,
      previousExecutionId: value.previous.id,
      validationPolicySnapshot: value.previous.validationPolicySnapshot,
      tiePolicySnapshot: value.previous.tiePolicySnapshot,
      fairnessModeSnapshot: value.previous.fairnessModeSnapshot,
      configurationVersion: value.previous.configurationVersion,
      configurationHash: value.previous.configurationHash,
      fairnessProtocolVersion: value.previous.fairnessProtocolVersion,
      operatorUserId: null,
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "bingo.execution.restarted.v1",
      result: "SUCCEEDED",
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      eventType: "bingo.execution.restarted.v1",
      aggregateVersion: 0n,
    });
    expect(idempotency).toHaveLength(1);
    expect(idempotency[0]?.status).toBe("SUCCEEDED");
    expect(draws).toBe(0);
  });

  it("replays the same key without creating a duplicate revision", async () => {
    const value = await scenario("restart-replay");
    const command: RestartExecutionCommand = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      previousExecutionId: value.previous.id,
      reason: "Idempotent restart",
    };
    const commandContext = context(
      value.fixture.user.id,
      command,
      "restart-replay-key-0001",
    );
    const [first, replay] = await Promise.all([
      service(prisma).restart(command, commandContext),
      service(concurrentPrisma).restart(command, commandContext),
    ]);

    expect(replay).toEqual(first);
    await expect(
      prisma.bingoRoundExecution.count({
        where: { roundId: command.roundId, revision: 2 },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.bingoAuditEvent.count({
        where: { eventId: command.eventId, action: BINGO_RESTART_AUDIT_ACTION },
      }),
    ).resolves.toBe(1);
  });

  it("serializes different operators and rejects a stale predecessor", async () => {
    const value = await scenario("restart-concurrent");
    const secondActor = await prisma.user.create({
      data: {
        email: `bingo-restart-${randomUUID()}@example.com`,
        passwordHash: "not-a-real-hash",
        fullName: "Second Bingo restart operator",
      },
    });
    const command: RestartExecutionCommand = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      previousExecutionId: value.previous.id,
      reason: "Concurrent restart",
    };
    const settled = await Promise.allSettled([
      service(prisma).restart(
        command,
        context(value.fixture.user.id, command, "restart-race-key-operator-1"),
      ),
      service(concurrentPrisma).restart(
        command,
        context(secondActor.id, command, "restart-race-key-operator-2"),
      ),
    ]);

    expect(
      settled.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = settled.find(
      (entry): entry is PromiseRejectedResult => entry.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      code: BingoRestartErrorCode.PREVIOUS_EXECUTION_NOT_LATEST,
    });
    await expect(
      prisma.bingoRoundExecution.count({
        where: { roundId: command.roundId, revision: 2 },
      }),
    ).resolves.toBe(1);
  });

  it.each<RestartFailurePoint>(["AFTER_CREATE", "AFTER_AUDIT", "AFTER_OUTBOX"])(
    "rolls back every artifact after injected failure %s",
    async (failAt) => {
      const value = await scenario(
        `restart-rollback-${failAt.toLowerCase().replaceAll("_", "-")}`,
      );
      const command: RestartExecutionCommand = {
        eventId: value.event.id,
        roundId: value.configured.round.id,
        previousExecutionId: value.previous.id,
        reason: "Rollback verification",
      };
      await expect(
        service(prisma, failAt).restart(
          command,
          context(
            value.fixture.user.id,
            command,
            `restart-rollback-key-${failAt}`,
          ),
        ),
      ).rejects.toThrow(`injected-restart-${failAt}`);

      const [executions, audit, outbox, idempotency] = await Promise.all([
        prisma.bingoRoundExecution.count({
          where: { roundId: command.roundId },
        }),
        prisma.bingoAuditEvent.count({ where: { eventId: command.eventId } }),
        prisma.bingoOutboxEvent.count({ where: { eventId: command.eventId } }),
        prisma.bingoCommandIdempotency.count({
          where: { eventId: command.eventId },
        }),
      ]);
      expect({ executions, audit, outbox, idempotency }).toEqual({
        executions: 1,
        audit: 0,
        outbox: 0,
        idempotency: 0,
      });
    },
  );

  it("requires manage permission and distinct supervisor approval for dual control", async () => {
    const value = await scenario("restart-dual-control", "DUAL_CONTROL");
    const supervisor = await prisma.user.create({
      data: {
        email: `bingo-supervisor-${randomUUID()}@example.com`,
        passwordHash: "not-a-real-hash",
        fullName: "Bingo restart supervisor",
      },
    });
    const withoutApproval: RestartExecutionCommand = {
      eventId: value.event.id,
      roundId: value.configured.round.id,
      previousExecutionId: value.previous.id,
      reason: "Dual-control restart",
    };
    expect(() =>
      service(prisma).restart(
        withoutApproval,
        context(
          value.fixture.user.id,
          withoutApproval,
          "restart-forbidden-key-0001",
          undefined,
          ["bingo.operate"],
        ),
      ),
    ).toThrow(
      expect.objectContaining({ code: BingoRestartErrorCode.FORBIDDEN }),
    );

    await expect(
      service(prisma).restart(
        withoutApproval,
        context(
          value.fixture.user.id,
          withoutApproval,
          "restart-dual-missing-key-0001",
        ),
      ),
    ).rejects.toMatchObject({ code: "BINGO_RESTART_SUPERVISOR_REQUIRED" });

    const approved: RestartExecutionCommand = {
      ...withoutApproval,
      supervisorApproval: {
        supervisorUserId: supervisor.id,
        approvedAt: "2026-08-11T17:59:00.000Z",
        reference: "SUPERVISOR-APPROVAL-001",
      },
    };
    const result = await service(prisma).restart(
      approved,
      context(
        value.fixture.user.id,
        approved,
        "restart-dual-approved-key-0001",
      ),
    );
    await expect(
      prisma.bingoRoundExecution.findUniqueOrThrow({
        where: { id: result.executionId },
        select: { supervisorUserId: true },
      }),
    ).resolves.toEqual({ supervisorUserId: supervisor.id });
  });
});
