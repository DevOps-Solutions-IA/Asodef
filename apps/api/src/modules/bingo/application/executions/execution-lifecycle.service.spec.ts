import { Prisma } from "@prisma/client";
import type { CommandContext } from "../kernel";
import { BingoLockManager, BingoTransactionKernel } from "../kernel";
import type { ExecutionEffectsPort } from "./execution-effects.port";
import { BingoExecutionLifecycleService } from "./execution-lifecycle.service";

const now = new Date("2026-08-11T15:00:00.000Z");
const context: CommandContext = {
  actor: { userId: "operator-1", permissions: new Set(["bingo.operate"]) },
  requestId: "request-1",
  idempotencyKey: "key-1",
  idempotencyKeyHash: "a".repeat(64),
  requestHash: "b".repeat(64),
  clock: { now: () => now },
};
const command = {
  eventId: "event-1",
  roundId: "round-1",
  executionId: "execution-1",
};
const startCommand = {
  ...command,
  expectedConfigurationVersion: 2,
};

function execution(overrides: Record<string, unknown> = {}) {
  return {
    id: "execution-1",
    eventId: "event-1",
    roundId: "round-1",
    revision: 1,
    status: "PLANNED",
    stateVersion: 0n,
    validationPolicySnapshot: "SIMPLE",
    tiePolicySnapshot: "SPLIT_PRIZE",
    fairnessModeSnapshot: "CRYPTO_RNG",
    configurationVersion: 2,
    operatorUserId: null,
    supervisorUserId: null,
    fairness: null,
    round: {
      id: "round-1",
      eventId: "event-1",
      status: "READY",
      validationPolicy: "SIMPLE",
      tiePolicy: "SPLIT_PRIZE",
      configurationVersion: 2,
      configurationLockedAt: new Date("2026-08-10T00:00:00Z"),
      event: {
        id: "event-1",
        status: "PUBLISHED",
        fairnessMode: "CRYPTO_RNG",
        configurationLockedAt: new Date("2026-08-10T00:00:00Z"),
      },
    },
    ...overrides,
  };
}

function harness(row = execution()) {
  const txMock = {
    bingoRoundExecution: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(null),
      update: jest.fn().mockResolvedValue(undefined),
    },
    bingoRound: {
      update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    },
    bingoEvent: { update: jest.fn().mockResolvedValue(undefined) },
  };
  const tx = txMock as unknown as Prisma.TransactionClient;
  const runner = {
    transaction: async <T>(
      _isolation: Prisma.TransactionIsolationLevel,
      work: (client: Prisma.TransactionClient) => Promise<T>,
    ) => work(tx),
  };
  const effects: ExecutionEffectsPort = {
    appendAudit: jest.fn().mockResolvedValue(undefined),
    appendOutbox: jest.fn().mockResolvedValue(undefined),
  };
  const locks = {
    acquire: jest.fn().mockResolvedValue(undefined),
  } as unknown as BingoLockManager;
  const completionPolicy = {
    assertCanComplete: jest.fn().mockResolvedValue(undefined),
  };
  const configurationSnapshot = {
    resolve: jest.fn().mockResolvedValue({
      configurationHash: "c".repeat(64),
      fairnessProtocolVersion: "asodef-bingo-fairness-v1",
    }),
  };
  const service = new BingoExecutionLifecycleService(
    new BingoTransactionKernel(runner),
    locks,
    effects,
    completionPolicy,
    configurationSnapshot,
  );
  return {
    service,
    tx: txMock,
    effects,
    locks,
    completionPolicy,
    configurationSnapshot,
  };
}

describe("BingoExecutionLifecycleService", () => {
  it("starts execution, round and event and records audit/outbox inside one transaction", async () => {
    const { service, tx, effects, locks } = harness();
    await expect(service.start(startCommand, context)).resolves.toMatchObject({
      status: "RUNNING",
      stateVersion: 1n,
      occurredAt: now,
    });
    expect(locks.acquire).toHaveBeenCalledWith(
      tx,
      expect.objectContaining(command),
    );
    expect(tx.bingoRoundExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RUNNING",
          configurationHash: "c".repeat(64),
          fairnessProtocolVersion: "asodef-bingo-fairness-v1",
        }),
      }),
    );
    expect(tx.bingoRound.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "IN_PROGRESS" } }),
    );
    expect(tx.bingoEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IN_PROGRESS" }),
      }),
    );
    expect(effects.appendAudit).toHaveBeenCalledTimes(1);
    expect(effects.appendOutbox).toHaveBeenCalledTimes(1);
  });

  it("fails closed for commit-reveal even when a commitment is published", async () => {
    const row = execution({
      fairnessModeSnapshot: "CRYPTO_RNG_COMMIT_REVEAL",
      fairness: { publishedAt: new Date("2026-08-10T01:00:00Z") },
      round: {
        ...execution().round,
        event: {
          ...execution().round.event,
          fairnessMode: "CRYPTO_RNG_COMMIT_REVEAL",
        },
      },
    });
    const { service, tx, effects } = harness(row);
    await expect(service.start(startCommand, context)).rejects.toMatchObject({
      code: "COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY",
    });
    expect(tx.bingoRoundExecution.update).not.toHaveBeenCalled();
    expect(effects.appendAudit).not.toHaveBeenCalled();
  });

  it("rejects a malformed server-side reproducibility snapshot", async () => {
    const value = harness();
    value.configurationSnapshot.resolve.mockResolvedValue({
      configurationHash: "client-controlled-or-malformed",
      fairnessProtocolVersion: "",
    });
    await expect(
      value.service.start(startCommand, context),
    ).rejects.toMatchObject({
      code: "BINGO_CONFIGURATION_SNAPSHOT_MISMATCH",
      details: { reason: "INVALID_SERVER_CONFIGURATION_SNAPSHOT" },
    });
    expect(value.tx.bingoRoundExecution.update).not.toHaveBeenCalled();
  });

  it("pauses and resumes without altering existing draws", async () => {
    const running = execution({ status: "RUNNING", stateVersion: 3n });
    const pausedHarness = harness(running);
    await expect(
      pausedHarness.service.pause(command, context),
    ).resolves.toMatchObject({
      status: "PAUSED",
      stateVersion: 4n,
    });
    expect(pausedHarness.tx.bingoRoundExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pausedAt: now }),
      }),
    );

    const resumeHarness = harness(
      execution({ status: "PAUSED", stateVersion: 4n }),
    );
    await expect(
      resumeHarness.service.resume(command, context),
    ).resolves.toMatchObject({
      status: "RUNNING",
      stateVersion: 5n,
    });
  });

  it("requires distinct supervisor evidence for dual-control cancellation", async () => {
    const row = execution({
      status: "RUNNING",
      validationPolicySnapshot: "DUAL_CONTROL",
      supervisorUserId: "supervisor-1",
    });
    const denied = harness(row);
    await expect(
      denied.service.cancel(
        { ...command, reason: "operational incident" },
        context,
      ),
    ).rejects.toMatchObject({ code: "BINGO_DUAL_CONTROL_REQUIRED" });

    const allowed = harness(row);
    await expect(
      allowed.service.cancel(
        {
          ...command,
          reason: " operational incident ",
          supervisorApproval: {
            supervisorUserId: "supervisor-1",
            approvedAt: new Date("2026-08-11T14:59:00Z"),
            reference: "approval-1",
          },
        },
        context,
      ),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(allowed.effects.appendAudit).toHaveBeenCalledWith(
      expect.anything(),
      context,
      expect.objectContaining({ reason: "operational incident" }),
    );
  });

  it("checks completion policy under the transaction before making a terminal update", async () => {
    const ready = harness(
      execution({
        status: "RUNNING",
        stateVersion: 7n,
        round: { ...execution().round, status: "IN_PROGRESS" },
      }),
    );
    await expect(
      ready.service.complete(command, context),
    ).resolves.toMatchObject({
      status: "COMPLETED",
      stateVersion: 8n,
    });
    expect(ready.completionPolicy.assertCanComplete).toHaveBeenCalledWith(
      ready.tx,
      { eventId: "event-1", roundId: "round-1", executionId: "execution-1" },
    );

    const blocked = harness(execution({ status: "RUNNING" }));
    blocked.completionPolicy.assertCanComplete.mockRejectedValue(
      new Error("winner resolution pending"),
    );
    await expect(blocked.service.complete(command, context)).rejects.toThrow(
      "winner resolution pending",
    );
    expect(blocked.tx.bingoRoundExecution.update).not.toHaveBeenCalled();
  });

  it("requires the application permission before opening a transaction", () => {
    const { service, tx } = harness();
    expect(() =>
      service.start(startCommand, {
        ...context,
        actor: { ...context.actor, permissions: new Set() },
      }),
    ).toThrow(expect.objectContaining({ code: "BINGO_APPLICATION_FORBIDDEN" }));
    expect(tx.bingoRoundExecution.findFirst).not.toHaveBeenCalled();
  });
});
