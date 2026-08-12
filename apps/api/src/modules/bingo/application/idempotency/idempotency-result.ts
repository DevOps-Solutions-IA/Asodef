import type { Prisma } from "@prisma/client";
import type { BingoCommandResult } from "./idempotency-contracts";
import {
  BingoIdempotencyError,
  BingoIdempotencyErrorCode,
} from "./idempotency-errors";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = /^[A-Z][A-Z0-9_]{0,63}$/;
const ALLOWED_KEYS = new Set([
  "schemaVersion",
  "resourceType",
  "resourceId",
  "status",
  "executionId",
  "revision",
  "sequence",
  "ballNumber",
  "candidateCount",
]);
const RESOURCE_TYPES = new Set(["EXECUTION", "DRAW", "CANDIDATE", "WINNER"]);

export function assertCommandResult(
  value: unknown,
): asserts value is BingoCommandResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_RESULT);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !ALLOWED_KEYS.has(key)) ||
    record.schemaVersion !== 1 ||
    typeof record.resourceType !== "string" ||
    !RESOURCE_TYPES.has(record.resourceType) ||
    typeof record.resourceId !== "string" ||
    !UUID.test(record.resourceId) ||
    typeof record.status !== "string" ||
    !STATUS.test(record.status) ||
    (record.executionId !== undefined &&
      (typeof record.executionId !== "string" ||
        !UUID.test(record.executionId))) ||
    !optionalPositiveInteger(record.revision) ||
    !optionalPositiveInteger(record.sequence) ||
    !optionalIntegerInRange(record.ballNumber, 1, 75) ||
    !optionalIntegerInRange(record.candidateCount, 0, 50_000)
  ) {
    throw new BingoIdempotencyError(BingoIdempotencyErrorCode.INVALID_RESULT);
  }
}

function optionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && Number(value) > 0);
}

function optionalIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): boolean {
  return (
    value === undefined ||
    (Number.isInteger(value) && Number(value) >= min && Number(value) <= max)
  );
}

export function toResultJson(
  result: BingoCommandResult,
): Prisma.InputJsonObject {
  assertCommandResult(result);
  return { ...result };
}

export function fromResultJson(value: unknown): BingoCommandResult {
  assertCommandResult(value);
  return Object.freeze({ ...value });
}
