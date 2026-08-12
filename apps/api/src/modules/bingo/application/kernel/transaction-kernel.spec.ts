import { Prisma } from "@prisma/client";
import type { CommandContext } from "./command-context";
import {
  BingoTransactionKernel,
  isRetryableBingoTransactionError,
  type BingoTransactionRunner,
} from "./transaction-kernel";
import type { BingoTransactionObserver } from "./transaction-observer";

const context: CommandContext = {
  actor: { userId: "actor", permissions: new Set(["bingo.operate"]) },
  requestId: "request-1",
  idempotencyKey: "key-1",
  idempotencyKeyHash: "a".repeat(64),
  requestHash: "b".repeat(64),
  clock: { now: () => new Date("2026-08-11T10:00:00.000Z") },
};

describe("BingoTransactionKernel", () => {
  it("retries only exact PostgreSQL serialization/deadlock states for idempotent commands", async () => {
    let attempts = 0;
    const runner: BingoTransactionRunner = {
      transaction: async (_isolation, work) => {
        attempts += 1;
        if (attempts < 3) throw { code: attempts === 1 ? "40001" : "40P01" };
        return work({} as Prisma.TransactionClient);
      },
    };
    const observations: Parameters<BingoTransactionObserver["observe"]>[0][] =
      [];
    const kernel = new BingoTransactionKernel(
      runner,
      { observe: (item) => observations.push(item) },
      async () => undefined,
    );

    await expect(
      kernel.execute(
        context,
        {
          command: "test",
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          idempotent: true,
        },
        async () => "committed",
      ),
    ).resolves.toBe("committed");
    expect(attempts).toBe(3);
    expect(observations.map((item) => item.outcome)).toEqual([
      "RETRYING",
      "RETRYING",
      "COMMITTED",
    ]);
  });

  it("does not retry business errors or non-idempotent operations", async () => {
    const business = new Error("business");
    const businessRunner: BingoTransactionRunner = {
      transaction: jest.fn().mockRejectedValue(business),
    };
    const businessKernel = new BingoTransactionKernel(businessRunner);
    await expect(
      businessKernel.execute(
        context,
        {
          command: "business",
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          idempotent: true,
        },
        async () => undefined,
      ),
    ).rejects.toBe(business);
    expect(businessRunner.transaction).toHaveBeenCalledTimes(1);

    const deadlockRunner: BingoTransactionRunner = {
      transaction: jest.fn().mockRejectedValue({ code: "40P01" }),
    };
    const nonIdempotentKernel = new BingoTransactionKernel(deadlockRunner);
    await expect(
      nonIdempotentKernel.execute(
        context,
        {
          command: "unsafe",
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          idempotent: false,
        },
        async () => undefined,
      ),
    ).rejects.toEqual({ code: "40P01" });
    expect(deadlockRunner.transaction).toHaveBeenCalledTimes(1);
  });

  it("recognizes nested Prisma metadata without treating P2034 alone as retryable", () => {
    expect(
      isRetryableBingoTransactionError({
        meta: { database_error_code: "40001" },
      }),
    ).toBe(true);
    expect(isRetryableBingoTransactionError({ cause: { code: "40P01" } })).toBe(
      true,
    );
    expect(isRetryableBingoTransactionError({ code: "P2034" })).toBe(false);
    expect(isRetryableBingoTransactionError({ code: "23505" })).toBe(false);
  });

  it("rejects malformed command context before opening a transaction", async () => {
    const runner: BingoTransactionRunner = { transaction: jest.fn() };
    const kernel = new BingoTransactionKernel(runner);
    await expect(
      kernel.execute(
        { ...context, requestHash: "not-a-hash" },
        {
          command: "invalid",
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          idempotent: true,
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "BINGO_INVALID_COMMAND_CONTEXT" });
    expect(runner.transaction).not.toHaveBeenCalled();
  });
});
