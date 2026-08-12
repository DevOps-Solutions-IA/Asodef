import { Prisma } from "@prisma/client";
import { calculateConfigurationHash } from "../../domain/fairness";
import {
  PrismaBingoAuditRepository,
  type BingoAuditAction,
} from "../audit";
import type { CommandContext } from "../kernel";
import {
  PrismaBingoOutboxRepository,
  type BingoOutboxEventType,
} from "../outbox";
import type {
  ExecutionAuditRecord,
  ExecutionCompletionPolicyPort,
  ExecutionConfigurationSnapshotPort,
  ExecutionEffectsPort,
  ExecutionOutboxRecord,
} from "./execution-effects.port";

const CRYPTO_RNG_PROTOCOL_VERSION = "asodef-bingo-crypto-rng-v1";

type SequenceRow = { sequence: bigint };

/**
 * Concrete ETAPA 5 adapter. The caller must already hold the canonical event
 * lock; that makes max(sequence)+1 safe for the event-scoped outbox stream.
 */
export class PrismaExecutionEffectsAdapter implements ExecutionEffectsPort {
  constructor(
    private readonly audit = new PrismaBingoAuditRepository(),
    private readonly outbox = new PrismaBingoOutboxRepository(),
  ) {}

  async appendAudit(
    tx: Prisma.TransactionClient,
    context: CommandContext,
    record: ExecutionAuditRecord,
  ): Promise<void> {
    await this.audit.append(tx, {
      eventId: record.eventId,
      roundId: record.roundId,
      executionId: record.executionId,
      actorUserId: context.actor.userId,
      actorPermission: "bingo.operate",
      action: record.action as BingoAuditAction,
      result: "SUCCEEDED",
      reason: record.reason,
      previousState: toAuditState(record.previousState),
      newState: toAuditState(record.newState),
      requestId: context.requestId,
      idempotencyKeyHash: context.idempotencyKeyHash,
      metadata: {
        schemaVersion: 1,
        entityId: record.executionId,
      },
      occurredAt: context.clock.now(),
    });
  }

  async appendOutbox(
    tx: Prisma.TransactionClient,
    record: ExecutionOutboxRecord,
  ): Promise<void> {
    const sequence = await nextOutboxSequence(tx, record.eventId);
    const execution = await tx.bingoRoundExecution.findUniqueOrThrow({
      where: { id: record.executionId },
      select: {
        revision: true,
        previousExecutionId: true,
        configurationHash: true,
        fairnessProtocolVersion: true,
        updatedAt: true,
      },
    });
    await this.outbox.append(tx, {
      eventId: record.eventId,
      executionId: record.executionId,
      sequence,
      eventType: record.eventType as BingoOutboxEventType,
      aggregateType: "EXECUTION",
      aggregateId: record.aggregateId,
      aggregateVersion: record.aggregateVersion,
      payload: {
        schemaVersion: 1,
        executionId: record.executionId,
        roundId: record.publicPayload.roundId,
        revision: execution.revision,
        status: record.publicPayload.status as
          | "RUNNING"
          | "PAUSED"
          | "CANCELLED"
          | "COMPLETED"
          | "PLANNED",
        occurredAt: execution.updatedAt.toISOString(),
        ...(execution.previousExecutionId === null
          ? {}
          : { previousExecutionId: execution.previousExecutionId }),
        ...(execution.configurationHash === null
          ? {}
          : { configurationHash: execution.configurationHash }),
        ...(execution.fairnessProtocolVersion === null
          ? {}
          : { fairnessProtocolVersion: execution.fairnessProtocolVersion }),
      },
      createdAt: execution.updatedAt,
    });
  }
}

export class PrismaExecutionConfigurationSnapshotAdapter
  implements ExecutionConfigurationSnapshotPort
{
  async resolve(
    tx: Prisma.TransactionClient,
    execution: Readonly<{
      eventId: string;
      roundId: string;
      executionId: string;
      configurationVersion: number;
    }>,
  ) {
    const round = await tx.bingoRound.findFirstOrThrow({
      where: { id: execution.roundId, eventId: execution.eventId },
      include: {
        event: {
          select: {
            fairnessMode: true,
            maxCardsPerParticipant: true,
            defaultValidationPolicy: true,
            visibility: true,
          },
        },
        patterns: {
          orderBy: { sequence: "asc" },
          include: {
            pattern: {
              include: { masks: { orderBy: { sequence: "asc" } } },
            },
          },
        },
        prizes: { orderBy: { sequence: "asc" } },
      },
    });
    const configurationHash = calculateConfigurationHash({
      schemaVersion: 1,
      eventId: execution.eventId,
      roundId: execution.roundId,
      executionId: execution.executionId,
      configurationVersion: execution.configurationVersion,
      fairnessMode: round.event.fairnessMode,
      maxCardsPerParticipant: round.event.maxCardsPerParticipant,
      visibility: round.event.visibility,
      validationPolicy: round.validationPolicy,
      tiePolicy: round.tiePolicy,
      tiePolicyConfiguration:
        round.tiePolicyConfiguration === null
          ? null
          : JSON.parse(JSON.stringify(round.tiePolicyConfiguration)),
      patterns: round.patterns.map((binding) => ({
        id: binding.pattern.id,
        version: binding.pattern.version,
        kind: binding.pattern.kind,
        requiredMatchCount: binding.pattern.requiredMatchCount,
        masks: binding.pattern.masks.map((mask) => ({
          sequence: mask.sequence,
          positionMask: mask.positionMask,
        })),
      })),
      prizes: round.prizes.map((prize) => ({
        id: prize.id,
        sequence: prize.sequence,
        roundPatternId: prize.roundPatternId,
        patternId: prize.patternId,
        kind: prize.kind,
        amountMinor: prize.amountMinor,
        currency: prize.currency,
        quantity: prize.quantity,
      })),
    });
    return {
      configurationHash,
      fairnessProtocolVersion: CRYPTO_RNG_PROTOCOL_VERSION,
    } as const;
  }
}

export class PrismaExecutionCompletionPolicyAdapter
  implements ExecutionCompletionPolicyPort
{
  async assertCanComplete(
    tx: Prisma.TransactionClient,
    execution: Readonly<{
      eventId: string;
      roundId: string;
      executionId: string;
    }>,
  ): Promise<void> {
    const unresolved = await tx.bingoWinnerCandidate.count({
      where: { executionId: execution.executionId, status: "PENDING" },
    });
    if (unresolved > 0) {
      throw new Error("BINGO_EXECUTION_HAS_UNRESOLVED_CANDIDATES");
    }
  }
}

async function nextOutboxSequence(
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

function toAuditState(
  value: Readonly<Record<string, string | number | null>>,
) {
  const result: {
    status?: string;
    stateVersion?: number;
  } = {};
  if (typeof value.status === "string") result.status = value.status;
  const parsed = Number(value.stateVersion);
  if (Number.isSafeInteger(parsed) && parsed >= 0) result.stateVersion = parsed;
  return result;
}
