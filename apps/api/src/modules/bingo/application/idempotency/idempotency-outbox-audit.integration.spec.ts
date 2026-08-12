import { BingoAuditResult, type PrismaClient } from "@prisma/client";
import { createBingoFixture } from "../../../../database/bingo-test-fixture";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import { PrismaBingoAuditRepository } from "../audit";
import { PrismaBingoOutboxRepository } from "../outbox";
import { PrismaBingoIdempotencyRepository } from "./prisma-idempotency.repository";

describe("Bingo idempotency/outbox/audit (integration, real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let concurrentPrisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    concurrentPrisma = createTestPrismaClient();
    await prisma.$connect();
    await concurrentPrisma.$connect();
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), concurrentPrisma.$disconnect()]);
  });

  it("returns bounded IN_PROGRESS and replays one concurrent command", async () => {
    const fixture = await createBingoFixture(prisma, "stage5-idempotency");
    const event = await fixture.createEvent("stage5-idempotency");
    const repository = new PrismaBingoIdempotencyRepository();
    let signalReady!: () => void;
    let signalRelease!: () => void;
    const ready = new Promise<void>((resolve) => (signalReady = resolve));
    const release = new Promise<void>((resolve) => (signalRelease = resolve));
    const input = {
      eventId: event.id,
      actorUserId: fixture.user.id,
      scope: `event:${event.id}` as const,
      operation: "START_EXECUTION" as const,
      idempotencyKey: "stage5-concurrent-key-1234",
      request: { eventId: event.id },
      now: new Date("2026-08-11T12:00:00.000Z"),
    };

    const owner = prisma.$transaction(async (tx) => {
      const acquired = await repository.acquire(tx, input);
      expect(acquired.kind).toBe("ACQUIRED");
      signalReady();
      await release;
      if (acquired.kind !== "ACQUIRED") throw new Error("not acquired");
      await repository.succeed(
        tx,
        acquired.recordId,
        {
          schemaVersion: 1,
          resourceType: "EXECUTION",
          resourceId: event.id,
          status: "RUNNING",
        },
        input.now,
      );
      return acquired.recordId;
    });
    await ready;
    const concurrent = await concurrentPrisma.$transaction((tx) =>
      repository.acquire(tx, input),
    );
    expect(concurrent).toEqual({ kind: "IN_PROGRESS", retryAfterMs: 250 });
    signalRelease();
    const recordId = await owner;

    const replay = await prisma.$transaction((tx) =>
      repository.acquire(tx, input),
    );
    expect(replay).toMatchObject({ kind: "REPLAY", recordId });
    await expect(
      prisma.bingoCommandIdempotency.count({ where: { id: recordId } }),
    ).resolves.toBe(1);
  });

  it("commits idempotency, audit and outbox together", async () => {
    const fixture = await createBingoFixture(prisma, "stage5-atomic-commit");
    const event = await fixture.createEvent("stage5-atomic-commit");
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );
    const idempotency = new PrismaBingoIdempotencyRepository();
    const audit = new PrismaBingoAuditRepository();
    const outbox = new PrismaBingoOutboxRepository();
    const now = new Date("2026-08-11T12:30:00.000Z");
    const ids = await prisma.$transaction(async (tx) => {
      const acquired = await idempotency.acquire(tx, {
        eventId: event.id,
        executionId: execution.id,
        actorUserId: fixture.user.id,
        scope: `execution:${execution.id}`,
        operation: "START_EXECUTION",
        idempotencyKey: "stage5-atomic-commit-key",
        request: { executionId: execution.id },
        now,
      });
      if (acquired.kind !== "ACQUIRED") throw new Error("not acquired");
      const auditId = await audit.append(tx, {
        eventId: event.id,
        roundId: configured.round.id,
        executionId: execution.id,
        actorUserId: fixture.user.id,
        actorPermission: "bingo.operate",
        action: "bingo.execution.started.v1",
        result: BingoAuditResult.SUCCEEDED,
        requestId: "stage5-atomic-commit",
        idempotencyKeyHash: acquired.keyHash,
        previousState: { status: "PLANNED", revision: 1 },
        newState: { status: "RUNNING", revision: 1 },
        metadata: { schemaVersion: 1, entityId: execution.id, revision: 1 },
        occurredAt: now,
      });
      const outboxId = await outbox.append(tx, {
        eventId: event.id,
        executionId: execution.id,
        sequence: 1n,
        eventType: "bingo.execution.started.v1",
        aggregateType: "EXECUTION",
        aggregateId: execution.id,
        aggregateVersion: 1n,
        payload: {
          schemaVersion: 1,
          executionId: execution.id,
          roundId: configured.round.id,
          revision: 1,
          status: "RUNNING",
          occurredAt: now.toISOString(),
        },
        createdAt: now,
      });
      await idempotency.succeed(
        tx,
        acquired.recordId,
        {
          schemaVersion: 1,
          resourceType: "EXECUTION",
          resourceId: execution.id,
          status: "RUNNING",
          revision: 1,
        },
        now,
      );
      return { recordId: acquired.recordId, auditId, outboxId };
    });
    await expect(
      prisma.bingoCommandIdempotency.count({ where: { id: ids.recordId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.bingoAuditEvent.count({ where: { id: ids.auditId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.bingoOutboxEvent.count({ where: { id: ids.outboxId } }),
    ).resolves.toBe(1);
  });

  it("rolls back idempotency, audit and outbox without partial evidence", async () => {
    const fixture = await createBingoFixture(prisma, "stage5-atomic-rollback");
    const event = await fixture.createEvent("stage5-atomic-rollback");
    const configured = await fixture.createConfiguredRound(event.id);
    const execution = await fixture.createExecution(
      event.id,
      configured.round.id,
    );
    const idempotency = new PrismaBingoIdempotencyRepository();
    const audit = new PrismaBingoAuditRepository();
    const outbox = new PrismaBingoOutboxRepository();
    const requestId = "stage5-forced-rollback";
    await expect(
      prisma.$transaction(async (tx) => {
        const acquired = await idempotency.acquire(tx, {
          eventId: event.id,
          executionId: execution.id,
          actorUserId: fixture.user.id,
          scope: `execution:${execution.id}`,
          operation: "START_EXECUTION",
          idempotencyKey: "stage5-atomic-rollback-key",
          request: { executionId: execution.id },
          now: new Date(),
        });
        if (acquired.kind !== "ACQUIRED") throw new Error("not acquired");
        await audit.append(tx, {
          eventId: event.id,
          roundId: configured.round.id,
          executionId: execution.id,
          actorUserId: fixture.user.id,
          actorPermission: "bingo.operate",
          action: "bingo.execution.started.v1",
          result: BingoAuditResult.SUCCEEDED,
          requestId,
          idempotencyKeyHash: acquired.keyHash,
          metadata: { schemaVersion: 1, entityId: execution.id, revision: 1 },
          occurredAt: new Date(),
        });
        await outbox.append(tx, {
          eventId: event.id,
          executionId: execution.id,
          sequence: 1n,
          eventType: "bingo.execution.started.v1",
          aggregateType: "EXECUTION",
          aggregateId: execution.id,
          aggregateVersion: 1n,
          payload: {
            schemaVersion: 1,
            executionId: execution.id,
            roundId: configured.round.id,
            revision: 1,
            status: "RUNNING",
            occurredAt: "2026-08-11T12:00:00.000Z",
          },
          createdAt: new Date(),
        });
        throw new Error("simulated-crash-before-commit");
      }),
    ).rejects.toThrow("simulated-crash-before-commit");
    await expect(
      prisma.bingoAuditEvent.count({ where: { requestId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.bingoOutboxEvent.count({ where: { eventId: event.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.bingoCommandIdempotency.count({ where: { eventId: event.id } }),
    ).resolves.toBe(0);
  });
});
