import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../database/prisma.service";
import {
  BingoApplicationError,
  BingoApplicationErrorCode,
  assertCommandContext,
} from "./application-error";
import type { CommandContext } from "./command-context";
import {
  NoopBingoTransactionObserver,
  type BingoTransactionObserver,
} from "./transaction-observer";

export const BINGO_RETRYABLE_SQL_STATES = new Set(["40001", "40P01"]);

export interface BingoTransactionOptions {
  readonly command: string;
  readonly isolationLevel: Prisma.TransactionIsolationLevel;
  readonly idempotent: boolean;
  readonly maxAttempts?: number;
}

export interface BingoTransactionRunner {
  transaction<T>(
    isolationLevel: Prisma.TransactionIsolationLevel,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
}

export class PrismaBingoTransactionRunner implements BingoTransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    isolationLevel: Prisma.TransactionIsolationLevel,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(work, { isolationLevel });
  }
}

export type BingoRetryDelay = (attempt: number) => Promise<void>;

function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  if (
    typeof record.code === "string" &&
    BINGO_RETRYABLE_SQL_STATES.has(record.code)
  ) {
    return record.code;
  }
  const meta = record.meta;
  if (typeof meta === "object" && meta !== null) {
    const metaRecord = meta as Record<string, unknown>;
    for (const key of ["database_error_code", "sqlstate", "code"] as const) {
      const value = metaRecord[key];
      if (typeof value === "string" && BINGO_RETRYABLE_SQL_STATES.has(value))
        return value;
    }
  }
  const cause = record.cause;
  return cause === error ? undefined : sqlState(cause);
}

export function isRetryableBingoTransactionError(error: unknown): boolean {
  return sqlState(error) !== undefined;
}

const defaultRetryDelay: BingoRetryDelay = async (attempt) => {
  const ceilingMs = Math.min(100, 5 * 2 ** (attempt - 1));
  const delayMs = randomInt(0, ceilingMs + 1);
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
};

export class BingoTransactionKernel {
  constructor(
    private readonly runner: BingoTransactionRunner,
    private readonly observer: BingoTransactionObserver = new NoopBingoTransactionObserver(),
    private readonly retryDelay: BingoRetryDelay = defaultRetryDelay,
  ) {}

  async execute<T>(
    context: CommandContext,
    options: BingoTransactionOptions,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    assertCommandContext({
      actorUserId: context.actor.userId,
      requestId: context.requestId,
      idempotencyKey: context.idempotencyKey,
      idempotencyKeyHash: context.idempotencyKeyHash,
      requestHash: context.requestHash,
    });
    const maxAttempts = options.idempotent ? (options.maxAttempts ?? 3) : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const started = performance.now();
      try {
        const result = await this.runner.transaction(
          options.isolationLevel,
          work,
        );
        this.observer.observe({
          command: options.command,
          isolationLevel: options.isolationLevel,
          attempt,
          durationMs: performance.now() - started,
          outcome: "COMMITTED",
        });
        return result;
      } catch (error) {
        const retryState = sqlState(error);
        const retry =
          options.idempotent &&
          retryState !== undefined &&
          attempt < maxAttempts;
        this.observer.observe({
          command: options.command,
          isolationLevel: options.isolationLevel,
          attempt,
          durationMs: performance.now() - started,
          outcome: retry ? "RETRYING" : "ROLLED_BACK",
          ...(retryState === undefined ? {} : { sqlState: retryState }),
        });
        if (!retry) {
          if (
            options.idempotent &&
            retryState !== undefined &&
            attempt === maxAttempts
          ) {
            throw new BingoApplicationError(
              BingoApplicationErrorCode.TRANSACTION_RETRY_EXHAUSTED,
              {
                command: options.command,
                attempts: attempt,
                sqlState: retryState,
              },
              { cause: error },
            );
          }
          throw error;
        }
        await this.retryDelay(attempt);
      }
    }
    throw new BingoApplicationError(
      BingoApplicationErrorCode.TRANSACTION_RETRY_EXHAUSTED,
    );
  }
}
