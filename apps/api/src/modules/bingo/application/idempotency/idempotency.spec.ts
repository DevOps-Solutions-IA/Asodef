import { BingoCommandStatus } from "@prisma/client";
import { hashIdempotencyRequest } from "./idempotency-hash";
import {
  BingoIdempotencyError,
  BingoIdempotencyErrorCode,
} from "./idempotency-errors";
import { assertCommandResult } from "./idempotency-result";
import { PrismaBingoIdempotencyRepository } from "./prisma-idempotency.repository";

const UUID = "11111111-1111-4111-8111-111111111111";
const KEY = "command-key-123456789";

describe("Bingo application idempotency", () => {
  it("hashes logically equivalent requests canonically", () => {
    expect(hashIdempotencyRequest({ b: 2, a: 1 })).toBe(
      hashIdempotencyRequest({ a: 1, b: 2 }),
    );
  });

  it("rejects result fields outside the persisted allowlist", () => {
    expect(() =>
      assertCommandResult({
        schemaVersion: 1,
        resourceType: "DRAW",
        resourceId: UUID,
        status: "CREATED",
        document: "not-allowed",
      }),
    ).toThrow(BingoIdempotencyError);
  });

  it("returns immediately when another transaction owns the command", async () => {
    const repository = new PrismaBingoIdempotencyRepository();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
    };
    await expect(
      repository.acquire(tx as never, {
        eventId: UUID,
        actorUserId: UUID,
        scope: `event:${UUID}`,
        operation: "START_EXECUTION",
        idempotencyKey: KEY,
        request: { eventId: UUID },
        now: new Date("2026-08-11T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ kind: "IN_PROGRESS", retryAfterMs: 250 });
  });

  it("rejects reuse of a key with a different canonical request", async () => {
    const repository = new PrismaBingoIdempotencyRepository();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      bingoCommandIdempotency: {
        findUnique: jest.fn().mockResolvedValue({
          id: UUID,
          eventId: UUID,
          executionId: null,
          actorUserId: UUID,
          scope: `event:${UUID}`,
          operation: "START_EXECUTION",
          keyHash: "a".repeat(64),
          requestHash: "b".repeat(64),
          status: BingoCommandStatus.SUCCEEDED,
          responseStatus: 200,
          responseBody: {
            schemaVersion: 1,
            resourceType: "EXECUTION",
            resourceId: UUID,
            status: "RUNNING",
          },
          createdAt: new Date(),
          completedAt: new Date(),
          expiresAt: null,
        }),
      },
    };
    await expect(
      repository.acquire(tx as never, {
        eventId: UUID,
        actorUserId: UUID,
        scope: `event:${UUID}`,
        operation: "START_EXECUTION",
        idempotencyKey: KEY,
        request: { eventId: UUID },
        now: new Date("2026-08-11T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: BingoIdempotencyErrorCode.KEY_REUSED_WITH_DIFFERENT_REQUEST,
    });
  });
});
