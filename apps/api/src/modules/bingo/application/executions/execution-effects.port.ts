import type { Prisma } from "@prisma/client";
import type { CommandContext } from "../kernel";

export interface ExecutionAuditRecord {
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
  readonly action: string;
  readonly result: "SUCCEEDED";
  readonly occurredAt: Date;
  readonly previousState: Readonly<Record<string, string | number | null>>;
  readonly newState: Readonly<Record<string, string | number | null>>;
  readonly reason?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ExecutionOutboxRecord {
  readonly eventId: string;
  readonly executionId: string;
  readonly eventType: string;
  readonly aggregateType: "BINGO_EXECUTION";
  readonly aggregateId: string;
  readonly aggregateVersion: bigint;
  readonly occurredAt: Date;
  readonly publicPayload: Readonly<{
    eventId: string;
    roundId: string;
    executionId: string;
    status: string;
    stateVersion: string;
  }>;
}

/**
 * Implementations must write through the supplied TransactionClient. Calling
 * PrismaService directly from an adapter would violate the atomicity contract.
 */
export interface ExecutionEffectsPort {
  appendAudit(
    tx: Prisma.TransactionClient,
    context: CommandContext,
    record: ExecutionAuditRecord,
  ): Promise<void>;
  appendOutbox(
    tx: Prisma.TransactionClient,
    record: ExecutionOutboxRecord,
  ): Promise<void>;
}

export interface ExecutionCompletionPolicyPort {
  assertCanComplete(
    tx: Prisma.TransactionClient,
    execution: Readonly<{
      eventId: string;
      roundId: string;
      executionId: string;
    }>,
  ): Promise<void>;
}

export interface ExecutionConfigurationSnapshotPort {
  resolve(
    tx: Prisma.TransactionClient,
    execution: Readonly<{
      eventId: string;
      roundId: string;
      executionId: string;
      configurationVersion: number;
    }>,
  ): Promise<
    Readonly<{
      configurationHash: string;
      fairnessProtocolVersion: string;
    }>
  >;
}
