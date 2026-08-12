import { Prisma } from "@prisma/client";
import {
  transitionEvent,
  transitionExecution,
  transitionRound,
} from "../../domain/lifecycle";
import {
  BINGO_APPLICATION_PERMISSIONS,
  BingoApplicationError,
  BingoApplicationErrorCode,
  BingoLockManager,
  BingoTransactionKernel,
  type BingoApplicationPermission,
  type CommandContext,
} from "../kernel";
import {
  hashIdempotencyKey,
  PrismaBingoIdempotencyRepository,
  type BingoMutatingOperation,
  type IdempotencyAcquisition,
} from "../idempotency";
import type {
  ExecutionCompletionPolicyPort,
  ExecutionConfigurationSnapshotPort,
  ExecutionEffectsPort,
} from "./execution-effects.port";
import type { ExecutionIdempotencyPort } from "./execution-idempotency.port";

export const BINGO_EXECUTION_EVENT_TYPES = {
  STARTED: "bingo.execution.started.v1",
  PAUSED: "bingo.execution.paused.v1",
  RESUMED: "bingo.execution.resumed.v1",
  COMPLETED: "bingo.execution.completed.v1",
  CANCELLED: "bingo.execution.cancelled.v1",
} as const;

interface ExecutionCommand {
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
}

export interface StartExecutionCommand extends ExecutionCommand {
  readonly expectedConfigurationVersion: number;
}

export interface CancelExecutionCommand extends ExecutionCommand {
  readonly reason: string;
  readonly supervisorApproval?: Readonly<{
    supervisorUserId: string;
    approvedAt: Date;
    reference: string;
  }>;
}

export interface ExecutionCommandResult {
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
  readonly status: "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
  readonly stateVersion: bigint;
  readonly occurredAt: Date;
  readonly replayed?: boolean;
}

type LockedExecution = Prisma.BingoRoundExecutionGetPayload<{
  include: { round: { include: { event: true } }; fairness: true };
}>;
type AcquiredIdempotency = Extract<
  IdempotencyAcquisition,
  { kind: "ACQUIRED" }
>;

function requirePermission(
  context: CommandContext,
  permission: BingoApplicationPermission,
): void {
  if (!context.actor.permissions.has(permission)) {
    throw new BingoApplicationError(BingoApplicationErrorCode.FORBIDDEN, {
      permission,
    });
  }
}

function requireValidNow(now: Date): Date {
  if (Number.isNaN(now.getTime())) {
    throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_CONTEXT, {
      field: "clock.now",
    });
  }
  return now;
}

function snapshot(status: string, stateVersion: bigint) {
  return { status, stateVersion: stateVersion.toString() };
}

export class BingoExecutionLifecycleService {
  constructor(
    private readonly kernel: BingoTransactionKernel,
    private readonly locks: BingoLockManager,
    private readonly effects: ExecutionEffectsPort,
    private readonly completionPolicy: ExecutionCompletionPolicyPort,
    private readonly configurationSnapshot: ExecutionConfigurationSnapshotPort,
    private readonly idempotency: ExecutionIdempotencyPort = new PrismaBingoIdempotencyRepository(),
  ) {}

  start(
    command: StartExecutionCommand,
    context: CommandContext,
  ): Promise<ExecutionCommandResult> {
    requirePermission(context, BINGO_APPLICATION_PERMISSIONS.OPERATE);
    return this.kernel.execute(
      context,
      {
        command: "bingo.execution.start",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      async (tx) => {
        const now = requireValidNow(context.clock.now());
        const acquisition = await this.acquireIdempotency(
          tx,
          command,
          context,
          now,
          "START_EXECUTION",
          BINGO_EXECUTION_EVENT_TYPES.STARTED,
        );
        if (acquisition.kind === "REPLAY") return acquisition.result;
        const current = await this.lockAndLoad(tx, command);

        if (
          current.round.event.status !== "PUBLISHED" &&
          current.round.event.status !== "IN_PROGRESS"
        ) {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.INVALID_STATE,
            {
              aggregate: "EVENT",
              from: current.round.event.status,
              to: "IN_PROGRESS",
            },
          );
        }
        if (current.round.status !== "READY" || current.status !== "PLANNED") {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.INVALID_STATE,
            {
              eventStatus: current.round.event.status,
              roundStatus: current.round.status,
              executionStatus: current.status,
            },
          );
        }
        if (
          current.round.event.configurationLockedAt === null ||
          current.round.configurationLockedAt === null
        ) {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.CONFIGURATION_NOT_FROZEN,
          );
        }
        if (
          current.configurationVersion !==
            command.expectedConfigurationVersion ||
          current.configurationVersion !== current.round.configurationVersion ||
          current.validationPolicySnapshot !== current.round.validationPolicy ||
          current.tiePolicySnapshot !== current.round.tiePolicy ||
          current.fairnessModeSnapshot !== current.round.event.fairnessMode
        ) {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.CONFIGURATION_SNAPSHOT_MISMATCH,
          );
        }
        if (current.validationPolicySnapshot === "DUAL_CONTROL") {
          if (
            current.supervisorUserId === null ||
            current.supervisorUserId === context.actor.userId
          ) {
            throw new BingoApplicationError(
              BingoApplicationErrorCode.DUAL_CONTROL_REQUIRED,
            );
          }
        }
        if (current.fairnessModeSnapshot === "CRYPTO_RNG_COMMIT_REVEAL") {
          // A published commitment is necessary but not sufficient. ASODEF has
          // no production seed-custody adapter yet, so operation must not start.
          if (
            current.fairness?.publishedAt === null ||
            current.fairness === null
          ) {
            throw new BingoApplicationError(
              BingoApplicationErrorCode.COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY,
              { commitmentPublished: false },
            );
          }
          throw new BingoApplicationError(
            BingoApplicationErrorCode.COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY,
            { commitmentPublished: true },
          );
        }
        const incompatible = await tx.bingoRoundExecution.findFirst({
          where: {
            roundId: command.roundId,
            status: { in: ["RUNNING", "PAUSED"] },
            id: { not: command.executionId },
          },
          select: { id: true },
        });
        if (incompatible !== null) {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.ACTIVE_EXECUTION_EXISTS,
            {
              executionId: incompatible.id,
            },
          );
        }

        const resolvedSnapshot = await this.configurationSnapshot.resolve(tx, {
          eventId: current.eventId,
          roundId: current.roundId,
          executionId: current.id,
          configurationVersion: current.configurationVersion,
        });
        if (
          !/^[0-9a-f]{64}$/.test(resolvedSnapshot.configurationHash) ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(
            resolvedSnapshot.fairnessProtocolVersion,
          )
        ) {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.CONFIGURATION_SNAPSHOT_MISMATCH,
            { reason: "INVALID_SERVER_CONFIGURATION_SNAPSHOT" },
          );
        }

        transitionExecution(current.status, "RUNNING");
        const nextVersion = current.stateVersion + 1n;
        await tx.bingoRoundExecution.update({
          where: { id: current.id },
          data: {
            status: "RUNNING",
            stateVersion: nextVersion,
            operatorUserId: context.actor.userId,
            startedAt: now,
            pausedAt: null,
            configurationHash: resolvedSnapshot.configurationHash,
            fairnessProtocolVersion: resolvedSnapshot.fairnessProtocolVersion,
          },
        });
        transitionRound(current.round.status, "IN_PROGRESS");
        await tx.bingoRound.update({
          where: { id: current.roundId },
          data: { status: "IN_PROGRESS" },
        });
        if (current.round.event.status === "PUBLISHED") {
          transitionEvent(current.round.event.status, "IN_PROGRESS");
          await tx.bingoEvent.update({
            where: { id: current.eventId },
            data: {
              status: "IN_PROGRESS",
              startedAt: now,
              updatedByUserId: context.actor.userId,
            },
          });
        }
        return this.record(
          tx,
          context,
          current,
          "RUNNING",
          nextVersion,
          now,
          BINGO_EXECUTION_EVENT_TYPES.STARTED,
          acquisition.record,
        );
      },
    );
  }

  pause(
    command: ExecutionCommand,
    context: CommandContext,
  ): Promise<ExecutionCommandResult> {
    return this.transition(
      command,
      context,
      "PAUSED",
      BINGO_EXECUTION_EVENT_TYPES.PAUSED,
    );
  }

  resume(
    command: ExecutionCommand,
    context: CommandContext,
  ): Promise<ExecutionCommandResult> {
    return this.transition(
      command,
      context,
      "RUNNING",
      BINGO_EXECUTION_EVENT_TYPES.RESUMED,
    );
  }

  complete(
    command: ExecutionCommand,
    context: CommandContext,
  ): Promise<ExecutionCommandResult> {
    requirePermission(context, BINGO_APPLICATION_PERMISSIONS.OPERATE);
    return this.kernel.execute(
      context,
      {
        command: "bingo.execution.complete",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      async (tx) => {
        const now = requireValidNow(context.clock.now());
        const acquisition = await this.acquireIdempotency(
          tx,
          command,
          context,
          now,
          "COMPLETE_EXECUTION",
          BINGO_EXECUTION_EVENT_TYPES.COMPLETED,
        );
        if (acquisition.kind === "REPLAY") return acquisition.result;
        const current = await this.lockAndLoad(tx, command);
        await this.completionPolicy.assertCanComplete(tx, {
          eventId: current.eventId,
          roundId: current.roundId,
          executionId: current.id,
        });
        transitionExecution(current.status, "COMPLETED");
        const nextVersion = current.stateVersion + 1n;
        await tx.bingoRoundExecution.update({
          where: { id: current.id },
          data: {
            status: "COMPLETED",
            stateVersion: nextVersion,
            completedAt: now,
          },
        });
        transitionRound(current.round.status, "COMPLETED");
        await tx.bingoRound.update({
          where: { id: current.roundId },
          data: { status: "COMPLETED" },
        });
        const remaining = await tx.bingoRound.count({
          where: {
            eventId: current.eventId,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        });
        if (remaining === 0 && current.round.event.status === "IN_PROGRESS") {
          transitionEvent(current.round.event.status, "COMPLETED");
          await tx.bingoEvent.update({
            where: { id: current.eventId },
            data: {
              status: "COMPLETED",
              completedAt: now,
              updatedByUserId: context.actor.userId,
            },
          });
        }
        return this.record(
          tx,
          context,
          current,
          "COMPLETED",
          nextVersion,
          now,
          BINGO_EXECUTION_EVENT_TYPES.COMPLETED,
          acquisition.record,
        );
      },
    );
  }

  cancel(
    command: CancelExecutionCommand,
    context: CommandContext,
  ): Promise<ExecutionCommandResult> {
    requirePermission(context, BINGO_APPLICATION_PERMISSIONS.OPERATE);
    const reason = command.reason.trim();
    if (reason.length === 0) {
      throw new BingoApplicationError(
        BingoApplicationErrorCode.CANCELLATION_REASON_REQUIRED,
      );
    }
    return this.kernel.execute(
      context,
      {
        command: "bingo.execution.cancel",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      async (tx) => {
        const now = requireValidNow(context.clock.now());
        const acquisition = await this.acquireIdempotency(
          tx,
          command,
          context,
          now,
          "CANCEL_EXECUTION",
          BINGO_EXECUTION_EVENT_TYPES.CANCELLED,
        );
        if (acquisition.kind === "REPLAY") return acquisition.result;
        const current = await this.lockAndLoad(tx, command);
        const requiresSupervisor =
          current.validationPolicySnapshot === "DUAL_CONTROL";
        const approval = command.supervisorApproval;
        const approved =
          approval !== undefined &&
          approval.supervisorUserId !== context.actor.userId &&
          (current.supervisorUserId === null ||
            approval.supervisorUserId === current.supervisorUserId) &&
          approval.reference.trim().length > 0 &&
          !Number.isNaN(approval.approvedAt.getTime()) &&
          approval.approvedAt.getTime() <= now.getTime();
        if (requiresSupervisor && !approved) {
          throw new BingoApplicationError(
            BingoApplicationErrorCode.DUAL_CONTROL_REQUIRED,
          );
        }
        transitionExecution(current.status, "CANCELLED", {
          policy: {
            allowedFrom: ["PLANNED", "RUNNING", "PAUSED"],
            requiresAuthorization: true,
          },
          authorized: requiresSupervisor ? approved : true,
          reason,
        });
        const nextVersion = current.stateVersion + 1n;
        await tx.bingoRoundExecution.update({
          where: { id: current.id },
          data: {
            status: "CANCELLED",
            stateVersion: nextVersion,
            cancelledAt: now,
            cancelReason: reason,
          },
        });
        return this.record(
          tx,
          context,
          current,
          "CANCELLED",
          nextVersion,
          now,
          BINGO_EXECUTION_EVENT_TYPES.CANCELLED,
          acquisition.record,
          reason,
          approval === undefined
            ? undefined
            : {
                supervisorUserId: approval.supervisorUserId,
                supervisorApprovalReference: approval.reference.trim(),
                supervisorApprovedAt: approval.approvedAt.toISOString(),
              },
        );
      },
    );
  }

  private transition(
    command: ExecutionCommand,
    context: CommandContext,
    target: "RUNNING" | "PAUSED",
    eventType: string,
  ): Promise<ExecutionCommandResult> {
    requirePermission(context, BINGO_APPLICATION_PERMISSIONS.OPERATE);
    return this.kernel.execute(
      context,
      {
        command:
          target === "PAUSED"
            ? "bingo.execution.pause"
            : "bingo.execution.resume",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      async (tx) => {
        const now = requireValidNow(context.clock.now());
        const operation =
          target === "PAUSED" ? "PAUSE_EXECUTION" : "RESUME_EXECUTION";
        const acquisition = await this.acquireIdempotency(
          tx,
          command,
          context,
          now,
          operation,
          eventType,
        );
        if (acquisition.kind === "REPLAY") return acquisition.result;
        const current = await this.lockAndLoad(tx, command);
        transitionExecution(current.status, target);
        const nextVersion = current.stateVersion + 1n;
        await tx.bingoRoundExecution.update({
          where: { id: current.id },
          data: {
            status: target,
            stateVersion: nextVersion,
            ...(target === "PAUSED" ? { pausedAt: now } : {}),
          },
        });
        return this.record(
          tx,
          context,
          current,
          target,
          nextVersion,
          now,
          eventType,
          acquisition.record,
        );
      },
    );
  }

  private async lockAndLoad(
    tx: Prisma.TransactionClient,
    command: ExecutionCommand,
  ): Promise<LockedExecution> {
    await this.locks.acquire(tx, command);
    const current = await tx.bingoRoundExecution.findFirst({
      where: {
        id: command.executionId,
        roundId: command.roundId,
        eventId: command.eventId,
      },
      include: { round: { include: { event: true } }, fairness: true },
    });
    if (current === null) {
      throw new BingoApplicationError(BingoApplicationErrorCode.NOT_FOUND, {
        executionId: command.executionId,
      });
    }
    return current;
  }

  private async acquireIdempotency(
    tx: Prisma.TransactionClient,
    command: ExecutionCommand | StartExecutionCommand | CancelExecutionCommand,
    context: CommandContext,
    now: Date,
    operation: BingoMutatingOperation,
    eventType: string,
  ): Promise<
    | Readonly<{ kind: "ACQUIRED"; record: AcquiredIdempotency }>
    | Readonly<{ kind: "REPLAY"; result: ExecutionCommandResult }>
  > {
    const acquisition = await this.idempotency.acquire(tx, {
      eventId: command.eventId,
      executionId: command.executionId,
      actorUserId: context.actor.userId,
      scope: `execution:${command.executionId}`,
      operation,
      idempotencyKey: context.idempotencyKey,
      request: canonicalCommandRequest(command),
      now,
    });
    if (acquisition.kind === "IN_PROGRESS") {
      throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, {
        reason: "BINGO_IDEMPOTENCY_IN_PROGRESS",
        retryAfterMs: acquisition.retryAfterMs,
      });
    }
    if (acquisition.kind === "ACQUIRED") {
      return { kind: "ACQUIRED", record: acquisition };
    }
    if (
      acquisition.result.resourceType !== "EXECUTION" ||
      acquisition.result.resourceId !== command.executionId ||
      acquisition.result.executionId !== command.executionId
    ) {
      throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, {
        reason: "BINGO_IDEMPOTENCY_INVALID_REPLAY_RESULT",
      });
    }
    const keyHash = hashIdempotencyKey(context.idempotencyKey);
    const audit = await tx.bingoAuditEvent.findFirst({
      where: {
        eventId: command.eventId,
        executionId: command.executionId,
        actorUserId: context.actor.userId,
        action: eventType,
        idempotencyKeyHash: keyHash,
        result: "SUCCEEDED",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { newState: true, createdAt: true },
    });
    const stateVersion = readStateVersion(audit?.newState);
    if (audit === null || stateVersion === null) {
      throw new BingoApplicationError(BingoApplicationErrorCode.INVALID_STATE, {
        reason: "BINGO_IDEMPOTENCY_REPLAY_EVIDENCE_MISSING",
      });
    }
    return {
      kind: "REPLAY",
      result: {
        eventId: command.eventId,
        roundId: command.roundId,
        executionId: command.executionId,
        status: acquisition.result.status as ExecutionCommandResult["status"],
        stateVersion,
        occurredAt: audit.createdAt,
        replayed: true,
      },
    };
  }

  private async record(
    tx: Prisma.TransactionClient,
    context: CommandContext,
    current: LockedExecution,
    status: ExecutionCommandResult["status"],
    stateVersion: bigint,
    occurredAt: Date,
    eventType: string,
    idempotency: AcquiredIdempotency,
    reason?: string,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<ExecutionCommandResult> {
    const effectContext: CommandContext = {
      ...context,
      idempotencyKeyHash: idempotency.keyHash,
      requestHash: idempotency.requestHash,
    };
    await this.effects.appendAudit(tx, effectContext, {
      eventId: current.eventId,
      roundId: current.roundId,
      executionId: current.id,
      action: eventType,
      result: "SUCCEEDED",
      occurredAt,
      previousState: snapshot(current.status, current.stateVersion),
      newState: snapshot(status, stateVersion),
      ...(reason === undefined ? {} : { reason }),
      ...(metadata === undefined ? {} : { metadata }),
    });
    await this.effects.appendOutbox(tx, {
      eventId: current.eventId,
      executionId: current.id,
      eventType,
      aggregateType: "BINGO_EXECUTION",
      aggregateId: current.id,
      aggregateVersion: stateVersion,
      occurredAt,
      publicPayload: {
        eventId: current.eventId,
        roundId: current.roundId,
        executionId: current.id,
        status,
        stateVersion: stateVersion.toString(),
      },
    });
    const result: ExecutionCommandResult = {
      eventId: current.eventId,
      roundId: current.roundId,
      executionId: current.id,
      status,
      stateVersion,
      occurredAt,
    };
    await this.idempotency.succeed(
      tx,
      idempotency.recordId,
      {
        schemaVersion: 1,
        resourceType: "EXECUTION",
        resourceId: current.id,
        status,
        executionId: current.id,
      },
      occurredAt,
    );
    return result;
  }
}

function canonicalCommandRequest(
  command: ExecutionCommand | StartExecutionCommand | CancelExecutionCommand,
): Readonly<Record<string, unknown>> {
  if ("supervisorApproval" in command) {
    return {
      eventId: command.eventId,
      roundId: command.roundId,
      executionId: command.executionId,
      reason: command.reason,
      ...(command.supervisorApproval === undefined
        ? {}
        : {
            supervisorApproval: {
              supervisorUserId: command.supervisorApproval.supervisorUserId,
              approvedAt: command.supervisorApproval.approvedAt.toISOString(),
              reference: command.supervisorApproval.reference,
            },
          }),
    };
  }
  return { ...command };
}

function readStateVersion(
  value: Prisma.JsonValue | null | undefined,
): bigint | null {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }
  const raw = (value as Prisma.JsonObject).stateVersion;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) {
    return BigInt(raw);
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) return BigInt(raw);
  return null;
}
