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
import type {
  ExecutionCompletionPolicyPort,
  ExecutionConfigurationSnapshotPort,
  ExecutionEffectsPort,
} from "./execution-effects.port";

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
}

type LockedExecution = Prisma.BingoRoundExecutionGetPayload<{
  include: { round: { include: { event: true } }; fairness: true };
}>;

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

  private async record(
    tx: Prisma.TransactionClient,
    context: CommandContext,
    current: LockedExecution,
    status: ExecutionCommandResult["status"],
    stateVersion: bigint,
    occurredAt: Date,
    eventType: string,
    reason?: string,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<ExecutionCommandResult> {
    await this.effects.appendAudit(tx, context, {
      eventId: current.eventId,
      roundId: current.roundId,
      executionId: current.id,
      action: eventType,
      result: "SUCCEEDED",
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
      publicPayload: {
        eventId: current.eventId,
        roundId: current.roundId,
        executionId: current.id,
        status,
        stateVersion: stateVersion.toString(),
      },
    });
    return {
      eventId: current.eventId,
      roundId: current.roundId,
      executionId: current.id,
      status,
      stateVersion,
      occurredAt,
    };
  }
}
