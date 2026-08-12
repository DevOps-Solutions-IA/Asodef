import {
  BingoCommandStatus,
  Prisma,
  type BingoCommandIdempotency,
} from "@prisma/client";
import type {
  AcquireIdempotencyInput,
  BingoCommandResult,
  IdempotencyAcquisition,
} from "./idempotency-contracts";
import {
  assertIdempotencyScope,
  hashIdempotencyKey,
  hashIdempotencyRequest,
} from "./idempotency-hash";
import {
  BingoIdempotencyError,
  BingoIdempotencyErrorCode,
} from "./idempotency-errors";
import { fromResultJson, toResultJson } from "./idempotency-result";

const IN_PROGRESS_RETRY_AFTER_MS = 250;

type AdvisoryLockRow = { acquired: boolean };

/**
 * Must receive the transaction client used by the mutating command. The
 * advisory xact lock is deliberately non-blocking: a duplicate concurrent
 * request gets IN_PROGRESS and never waits indefinitely behind the owner.
 */
export class PrismaBingoIdempotencyRepository {
  async acquire(
    tx: Prisma.TransactionClient,
    input: AcquireIdempotencyInput,
  ): Promise<IdempotencyAcquisition> {
    assertIdempotencyScope(input.scope);
    const keyHash = hashIdempotencyKey(input.idempotencyKey);
    const requestHash = hashIdempotencyRequest(input.request);
    const lockIdentity = [
      "asodef:bingo:idempotency:v1",
      input.actorUserId,
      input.scope,
      input.operation,
      keyHash,
    ].join(":");
    const [lock] = await tx.$queryRaw<AdvisoryLockRow[]>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${lockIdentity}, 0)) AS acquired
    `);
    if (lock?.acquired !== true) {
      return { kind: "IN_PROGRESS", retryAfterMs: IN_PROGRESS_RETRY_AFTER_MS };
    }

    const where = {
      actorUserId_scope_operation_keyHash: {
        actorUserId: input.actorUserId,
        scope: input.scope,
        operation: input.operation,
        keyHash,
      },
    } as const;
    const existing = await tx.bingoCommandIdempotency.findUnique({ where });
    if (existing !== null) {
      return this.resolveExisting(tx, existing, requestHash);
    }

    const created = await tx.bingoCommandIdempotency.create({
      data: {
        eventId: input.eventId,
        executionId: input.executionId,
        actorUserId: input.actorUserId,
        scope: input.scope,
        operation: input.operation,
        keyHash,
        requestHash,
        createdAt: input.now,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
    return {
      kind: "ACQUIRED",
      recordId: created.id,
      keyHash,
      requestHash,
      resumedRetry: false,
    };
  }

  async succeed(
    tx: Prisma.TransactionClient,
    recordId: string,
    result: BingoCommandResult,
    now: Date,
  ): Promise<void> {
    const updated = await tx.bingoCommandIdempotency.updateMany({
      where: { id: recordId, status: BingoCommandStatus.PROCESSING },
      data: {
        status: BingoCommandStatus.SUCCEEDED,
        responseStatus: 200,
        responseBody: toResultJson(result),
        completedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_STATE);
    }
  }

  async fail(
    tx: Prisma.TransactionClient,
    recordId: string,
    failure: Readonly<{
      retryable: boolean;
      result: BingoCommandResult;
      now: Date;
    }>,
  ): Promise<void> {
    const updated = await tx.bingoCommandIdempotency.updateMany({
      where: { id: recordId, status: BingoCommandStatus.PROCESSING },
      data: {
        status: failure.retryable
          ? BingoCommandStatus.FAILED_RETRYABLE
          : BingoCommandStatus.FAILED_FINAL,
        responseStatus: failure.retryable ? 503 : 409,
        responseBody: toResultJson(failure.result),
        completedAt: failure.now,
      },
    });
    if (updated.count !== 1) {
      throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_STATE);
    }
  }

  private async resolveExisting(
    tx: Prisma.TransactionClient,
    existing: BingoCommandIdempotency,
    requestHash: string,
  ): Promise<IdempotencyAcquisition> {
    if (existing.requestHash !== requestHash) {
      throw new BingoIdempotencyError(
        BingoIdempotencyErrorCode.KEY_REUSED_WITH_DIFFERENT_REQUEST,
      );
    }
    if (existing.status === BingoCommandStatus.PROCESSING) {
      return { kind: "IN_PROGRESS", retryAfterMs: IN_PROGRESS_RETRY_AFTER_MS };
    }
    if (existing.status === BingoCommandStatus.FAILED_RETRYABLE) {
      await tx.bingoCommandIdempotency.update({
        where: { id: existing.id },
        data: {
          status: BingoCommandStatus.PROCESSING,
          responseStatus: null,
          responseBody: Prisma.DbNull,
          completedAt: null,
        },
      });
      return {
        kind: "ACQUIRED",
        recordId: existing.id,
        keyHash: existing.keyHash,
        requestHash,
        resumedRetry: true,
      };
    }
    if (existing.responseBody === null) {
      throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_STATE);
    }
    return {
      kind: "REPLAY",
      recordId: existing.id,
      status: existing.status,
      result: fromResultJson(existing.responseBody),
    };
  }
}
