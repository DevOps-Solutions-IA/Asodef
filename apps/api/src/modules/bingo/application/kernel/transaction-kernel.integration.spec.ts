import { Prisma, PrismaClient } from "@prisma/client";
import { createBingoFixture } from "../../../../database/bingo-test-fixture";
import { createTestPrismaClient } from "../../../../database/test-db-client";
import type { CommandContext } from "./command-context";
import {
  BingoTransactionKernel,
  type BingoTransactionRunner,
} from "./transaction-kernel";
import type { BingoTransactionObserver } from "./transaction-observer";

describe("BingoTransactionKernel deadlock recovery (real PostgreSQL)", () => {
  jest.setTimeout(30_000);

  it("retries one victim and commits both idempotent commands after inverted row locks", async () => {
    const setup = createTestPrismaClient();
    const firstClient = createTestPrismaClient();
    const secondClient = createTestPrismaClient();
    await Promise.all([
      setup.$connect(),
      firstClient.$connect(),
      secondClient.$connect(),
    ]);
    try {
      const fixture = await createBingoFixture(setup, "kernel-deadlock");
      const firstEvent = await fixture.createEvent("kernel-deadlock-first");
      const secondEvent = await fixture.createEvent("kernel-deadlock-second");
      const observations: Parameters<BingoTransactionObserver["observe"]>[0][] =
        [];
      const barrier = firstAttemptBarrier();
      const firstAttempts = { value: 0 };
      const secondAttempts = { value: 0 };
      const context = (suffix: string): CommandContext => ({
        actor: {
          userId: fixture.user.id,
          permissions: new Set(["bingo.operate"]),
        },
        requestId: `deadlock-request-${suffix}`,
        idempotencyKey: `deadlock-idempotency-${suffix}`,
        idempotencyKeyHash: "a".repeat(64),
        requestHash: "b".repeat(64),
        clock: { now: () => new Date() },
      });
      const run = (
        client: PrismaClient,
        attempts: { value: number },
        firstId: string,
        secondId: string,
        suffix: string,
      ) =>
        new BingoTransactionKernel(
          runner(client),
          { observe: (value) => observations.push(value) },
          async () => undefined,
        ).execute(
          context(suffix),
          {
            command: `deadlock-${suffix}`,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            idempotent: true,
          },
          async (tx) => {
            attempts.value += 1;
            await lockEvent(tx, firstId);
            if (attempts.value === 1) await barrier.arrive();
            await lockEvent(tx, secondId);
            return "committed";
          },
        );

      await expect(
        Promise.all([
          run(
            firstClient,
            firstAttempts,
            firstEvent.id,
            secondEvent.id,
            "first",
          ),
          run(
            secondClient,
            secondAttempts,
            secondEvent.id,
            firstEvent.id,
            "second",
          ),
        ]),
      ).resolves.toEqual(["committed", "committed"]);

      expect(firstAttempts.value + secondAttempts.value).toBe(3);
      expect(
        observations.filter((value) => value.outcome === "RETRYING"),
      ).toHaveLength(1);
      expect(
        observations.filter((value) => value.outcome === "COMMITTED"),
      ).toHaveLength(2);
    } finally {
      await Promise.all([
        setup.$disconnect(),
        firstClient.$disconnect(),
        secondClient.$disconnect(),
      ]);
    }
  });
});

function runner(client: PrismaClient): BingoTransactionRunner {
  return {
    transaction: (isolationLevel, work) =>
      client.$transaction(work, {
        isolationLevel,
        maxWait: 10_000,
        timeout: 15_000,
      }),
  };
}

async function lockEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM bingo_events WHERE id = ${eventId}::uuid FOR UPDATE`,
  );
}

function firstAttemptBarrier() {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    arrive: async () => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await ready;
    },
  };
}
