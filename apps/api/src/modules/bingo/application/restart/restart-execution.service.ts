import { BingoAuditResult, Prisma } from "@prisma/client";

import { BingoLifecycleError, evaluateRestart } from "../../domain/lifecycle";
import { PrismaBingoAuditRepository, type BingoAuditAction } from "../audit";
import {
  hashIdempotencyKey,
  hashIdempotencyRequest,
  PrismaBingoIdempotencyRepository,
} from "../idempotency";
import {
  BINGO_APPLICATION_PERMISSIONS,
  BingoLockManager,
  BingoTransactionKernel,
  type CommandContext,
} from "../kernel";
import {
  PrismaBingoOutboxRepository,
  type BingoOutboxEventType,
} from "../outbox";
import { BingoRestartError, BingoRestartErrorCode } from "./restart-errors";

export const BINGO_RESTART_AUDIT_ACTION =
  "bingo.execution.restarted.v1" satisfies BingoAuditAction;
export const BINGO_RESTART_OUTBOX_EVENT =
  "bingo.execution.restarted.v1" satisfies BingoOutboxEventType;

export interface SupervisorRestartApproval {
  /** Resolved from the authenticated approval, never copied from an HTTP body. */
  readonly supervisorUserId: string;
  readonly approvedAt: string;
  readonly reference: string;
}

export interface RestartExecutionCommand {
  readonly eventId: string;
  readonly roundId: string;
  readonly previousExecutionId: string;
  readonly reason: string;
  readonly supervisorApproval?: SupervisorRestartApproval;
}

export interface RestartExecutionResult {
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
  readonly previousExecutionId: string;
  readonly revision: number;
  readonly status: "PLANNED";
  readonly occurredAt: Date;
}

export type RestartFailurePoint =
  "AFTER_CREATE" | "AFTER_AUDIT" | "AFTER_OUTBOX";

export interface RestartFailureInjector {
  inject(point: RestartFailurePoint): Promise<void>;
}

const noFailure: RestartFailureInjector = { inject: async () => undefined };

type SequenceRow = { sequence: bigint };

function canonicalRequest(command: RestartExecutionCommand) {
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

function validDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value
    ? undefined
    : date;
}

export class BingoRestartExecutionService {
  constructor(
    private readonly kernel: BingoTransactionKernel,
    private readonly locks: BingoLockManager,
    private readonly idempotency = new PrismaBingoIdempotencyRepository(),
    private readonly audit = new PrismaBingoAuditRepository(),
    private readonly outbox = new PrismaBingoOutboxRepository(),
    private readonly failureInjector: RestartFailureInjector = noFailure,
  ) {}

  restart(
    command: RestartExecutionCommand,
    context: CommandContext,
  ): Promise<RestartExecutionResult> {
    if (!context.actor.permissions.has(BINGO_APPLICATION_PERMISSIONS.MANAGE)) {
      throw new BingoRestartError(BingoRestartErrorCode.FORBIDDEN, {
        permission: BINGO_APPLICATION_PERMISSIONS.MANAGE,
      });
    }
    const request = canonicalRequest(command);
    if (
      hashIdempotencyKey(context.idempotencyKey) !==
        context.idempotencyKeyHash ||
      hashIdempotencyRequest(request) !== context.requestHash
    ) {
      throw new BingoRestartError(
        BingoRestartErrorCode.INVALID_COMMAND_CONTEXT,
      );
    }

    return this.kernel.execute(
      context,
      {
        command: "bingo.execution.restart",
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        idempotent: true,
      },
      async (tx) => {
        const now = context.clock.now();
        if (Number.isNaN(now.getTime())) {
          throw new BingoRestartError(
            BingoRestartErrorCode.INVALID_COMMAND_CONTEXT,
            { field: "clock.now" },
          );
        }
        // Canonical database locks precede all mutable persistence adapters.
        await this.locks.acquire(tx, {
          eventId: command.eventId,
          roundId: command.roundId,
          executionId: command.previousExecutionId,
        });
        const previous = await tx.bingoRoundExecution.findFirst({
          where: {
            id: command.previousExecutionId,
            eventId: command.eventId,
            roundId: command.roundId,
          },
          include: { round: true },
        });
        if (previous === null) {
          throw new BingoRestartError(BingoRestartErrorCode.NOT_FOUND);
        }
        const acquired = await this.idempotency.acquire(tx, {
          eventId: command.eventId,
          executionId: command.previousExecutionId,
          actorUserId: context.actor.userId,
          scope: `round:${command.roundId}`,
          operation: "RESTART_EXECUTION",
          idempotencyKey: context.idempotencyKey,
          request,
          now,
        });
        if (acquired.kind === "IN_PROGRESS") {
          throw new BingoRestartError(
            BingoRestartErrorCode.IDEMPOTENCY_IN_PROGRESS,
            { retryAfterMs: acquired.retryAfterMs },
          );
        }
        if (acquired.kind === "REPLAY") {
          const replayed = await tx.bingoRoundExecution.findFirst({
            where: {
              id: acquired.result.resourceId,
              eventId: command.eventId,
              roundId: command.roundId,
              previousExecutionId: command.previousExecutionId,
            },
            select: { revision: true, createdAt: true },
          });
          if (replayed === null) {
            throw new BingoRestartError(
              BingoRestartErrorCode.INVALID_COMMAND_CONTEXT,
              { field: "idempotencyResult" },
            );
          }
          return {
            eventId: command.eventId,
            roundId: command.roundId,
            executionId: acquired.result.resourceId,
            previousExecutionId: command.previousExecutionId,
            revision: replayed.revision,
            status: "PLANNED",
            occurredAt: replayed.createdAt,
          };
        }
        const latest = await tx.bingoRoundExecution.findFirst({
          where: { roundId: command.roundId },
          orderBy: { revision: "desc" },
          select: { id: true, revision: true },
        });
        if (
          latest?.id !== previous.id ||
          latest.revision !== previous.revision
        ) {
          throw new BingoRestartError(
            BingoRestartErrorCode.PREVIOUS_EXECUTION_NOT_LATEST,
            { latestExecutionId: latest?.id },
          );
        }

        const approval = command.supervisorApproval;
        const approvedAt =
          approval === undefined ? undefined : validDate(approval.approvedAt);
        const decision = evaluateRestart({
          roundId: command.roundId,
          previousExecution: {
            id: previous.id,
            roundId: previous.roundId,
            revision: previous.revision,
            status: previous.status,
          },
          requestedByUserId: context.actor.userId,
          requestedAt: now,
          reason: command.reason,
          requiresSupervisorApproval:
            previous.validationPolicySnapshot === "DUAL_CONTROL",
          ...(approval === undefined || approvedAt === undefined
            ? {}
            : { approvedBySupervisorUserId: approval.supervisorUserId }),
        });
        if (!decision.allowed) {
          throw new BingoLifecycleError(decision.code, decision.details);
        }
        if (
          approval !== undefined &&
          (approvedAt === undefined ||
            approvedAt > now ||
            approval.reference.trim().length === 0)
        ) {
          throw new BingoRestartError(
            BingoRestartErrorCode.INVALID_COMMAND_CONTEXT,
            { field: "supervisorApproval" },
          );
        }

        const created = await tx.bingoRoundExecution.create({
          data: {
            eventId: previous.eventId,
            roundId: previous.roundId,
            revision: decision.value.revision,
            previousExecutionId: previous.id,
            status: "PLANNED",
            validationPolicySnapshot: previous.validationPolicySnapshot,
            tiePolicySnapshot: previous.tiePolicySnapshot,
            fairnessModeSnapshot: previous.fairnessModeSnapshot,
            configurationVersion: previous.configurationVersion,
            configurationHash: previous.configurationHash,
            fairnessProtocolVersion: previous.fairnessProtocolVersion,
            supervisorUserId:
              previous.validationPolicySnapshot === "DUAL_CONTROL"
                ? approval?.supervisorUserId
                : undefined,
            createdByUserId: context.actor.userId,
            retentionUntil: previous.retentionUntil,
            legalHoldAt: previous.legalHoldAt,
            createdAt: now,
          },
        });
        await this.failureInjector.inject("AFTER_CREATE");

        await this.audit.append(tx, {
          eventId: previous.eventId,
          roundId: previous.roundId,
          executionId: created.id,
          actorUserId: context.actor.userId,
          actorPermission: "bingo.manage",
          action: BINGO_RESTART_AUDIT_ACTION,
          result: BingoAuditResult.SUCCEEDED,
          reason: decision.value.reason,
          previousState: {
            status: previous.status,
            revision: previous.revision,
          },
          newState: { status: "PLANNED", revision: created.revision },
          requestId: context.requestId,
          idempotencyKeyHash: acquired.keyHash,
          metadata: {
            schemaVersion: 1,
            entityId: created.id,
            previousExecutionId: previous.id,
            revision: created.revision,
          },
          occurredAt: now,
          retentionUntil: previous.retentionUntil ?? undefined,
        });
        await this.failureInjector.inject("AFTER_AUDIT");

        const sequence = await this.nextOutboxSequence(tx, previous.eventId);
        await this.outbox.append(tx, {
          eventId: previous.eventId,
          executionId: created.id,
          sequence,
          eventType: BINGO_RESTART_OUTBOX_EVENT,
          aggregateType: "EXECUTION",
          aggregateId: created.id,
          aggregateVersion: 0n,
          payload: {
            schemaVersion: 1,
            executionId: created.id,
            roundId: created.roundId,
            revision: created.revision,
            status: "PLANNED",
            occurredAt: now.toISOString(),
            previousExecutionId: previous.id,
            ...(created.configurationHash === null
              ? {}
              : { configurationHash: created.configurationHash }),
            ...(created.fairnessProtocolVersion === null
              ? {}
              : {
                  fairnessProtocolVersion: created.fairnessProtocolVersion,
                }),
          },
          createdAt: now,
        });
        await this.failureInjector.inject("AFTER_OUTBOX");

        await this.idempotency.succeed(
          tx,
          acquired.recordId,
          {
            schemaVersion: 1,
            resourceType: "EXECUTION",
            resourceId: created.id,
            executionId: created.id,
            status: "PLANNED",
            revision: created.revision,
          },
          now,
        );

        return {
          eventId: created.eventId,
          roundId: created.roundId,
          executionId: created.id,
          previousExecutionId: previous.id,
          revision: created.revision,
          status: "PLANNED",
          occurredAt: now,
        };
      },
    );
  }

  private async nextOutboxSequence(
    tx: Prisma.TransactionClient,
    eventId: string,
  ): Promise<bigint> {
    const [row] = await tx.$queryRaw<SequenceRow[]>(Prisma.sql`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM bingo_outbox_events
      WHERE event_id = ${eventId}::uuid
    `);
    return row?.sequence ?? 1n;
  }
}
