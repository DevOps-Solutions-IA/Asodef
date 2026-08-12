import { BingoAuditResult } from "@prisma/client";
import {
  BINGO_AUDIT_ACTIONS,
  type AppendAuditInput,
  type BingoAuditMetadata,
  type BingoAuditState,
} from "./audit-contracts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const STATUS = /^[A-Z][A-Z0-9_]{0,63}$/;
const POLICIES = new Set([
  "SIMPLE",
  "DUAL_CONTROL",
  "SPLIT_PRIZE",
  "FULL_PRIZE_EACH",
  "TIE_BREAK",
  "PRECONFIGURED_SPECIAL_RULE",
]);
const PERMISSIONS = new Set([
  "bingo.operate",
  "bingo.validate",
  "bingo.manage",
]);
const STATE_KEYS = new Set([
  "status",
  "revision",
  "sequence",
  "ballNumber",
  "stateVersion",
]);
const METADATA_KEYS = new Set([
  "schemaVersion",
  "entityId",
  "previousExecutionId",
  "sequence",
  "ballNumber",
  "revision",
  "candidateCount",
  "winnerCount",
  "retryCount",
  "policy",
]);

export class BingoAuditValidationError extends Error {
  readonly code = "BINGO_AUDIT_INVALID_INPUT";

  constructor(readonly field: string) {
    super(`BINGO_AUDIT_INVALID_INPUT:${field}`);
    this.name = "BingoAuditValidationError";
  }
}

function uuid(value: unknown, field: string): void {
  if (typeof value !== "string" || !UUID.test(value))
    throw new BingoAuditValidationError(field);
}

function hash(value: unknown, field: string): void {
  if (
    value !== undefined &&
    (typeof value !== "string" || !SHA256.test(value))
  ) {
    throw new BingoAuditValidationError(field);
  }
}

function positiveInteger(value: unknown, field: string, max?: number): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) ||
      Number(value) < 1 ||
      (max !== undefined && Number(value) > max))
  ) {
    throw new BingoAuditValidationError(field);
  }
}

function nonNegativeInteger(value: unknown, field: string): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || Number(value) < 0)
  ) {
    throw new BingoAuditValidationError(field);
  }
}

function assertState(state: BingoAuditState | undefined, field: string): void {
  if (state === undefined) return;
  if (Object.keys(state).some((key) => !STATE_KEYS.has(key)))
    throw new BingoAuditValidationError(`${field}.keys`);
  if (state.status !== undefined && !STATUS.test(state.status))
    throw new BingoAuditValidationError(`${field}.status`);
  positiveInteger(state.revision, `${field}.revision`);
  positiveInteger(state.sequence, `${field}.sequence`, 75);
  positiveInteger(state.ballNumber, `${field}.ballNumber`, 75);
  positiveInteger(state.stateVersion, `${field}.stateVersion`);
}

function assertMetadata(metadata: BingoAuditMetadata): void {
  if (
    Object.keys(metadata).some((key) => !METADATA_KEYS.has(key)) ||
    metadata.schemaVersion !== 1
  ) {
    throw new BingoAuditValidationError("metadata.keys");
  }
  uuid(metadata.entityId, "metadata.entityId");
  if (metadata.previousExecutionId !== undefined)
    uuid(metadata.previousExecutionId, "metadata.previousExecutionId");
  positiveInteger(metadata.sequence, "metadata.sequence", 75);
  positiveInteger(metadata.ballNumber, "metadata.ballNumber", 75);
  positiveInteger(metadata.revision, "metadata.revision");
  nonNegativeInteger(metadata.candidateCount, "metadata.candidateCount");
  nonNegativeInteger(metadata.winnerCount, "metadata.winnerCount");
  nonNegativeInteger(metadata.retryCount, "metadata.retryCount");
  if (metadata.policy !== undefined && !POLICIES.has(metadata.policy))
    throw new BingoAuditValidationError("metadata.policy");
}

export function assertAuditInput(input: AppendAuditInput): void {
  uuid(input.eventId, "eventId");
  if (input.roundId !== undefined) uuid(input.roundId, "roundId");
  if (input.executionId !== undefined) uuid(input.executionId, "executionId");
  uuid(input.actorUserId, "actorUserId");
  if (!PERMISSIONS.has(input.actorPermission))
    throw new BingoAuditValidationError("actorPermission");
  if (!(BINGO_AUDIT_ACTIONS as readonly string[]).includes(input.action))
    throw new BingoAuditValidationError("action");
  if (!Object.values(BingoAuditResult).includes(input.result))
    throw new BingoAuditValidationError("result");
  if (input.requestId.trim().length < 1 || input.requestId.length > 200)
    throw new BingoAuditValidationError("requestId");
  if (
    input.reason !== undefined &&
    (input.reason.trim().length < 1 || input.reason.length > 1000)
  )
    throw new BingoAuditValidationError("reason");
  if (input.result !== BingoAuditResult.SUCCEEDED && input.reason === undefined)
    throw new BingoAuditValidationError("reason");
  hash(input.idempotencyKeyHash, "idempotencyKeyHash");
  hash(input.ipHash, "ipHash");
  hash(input.userAgentHash, "userAgentHash");
  assertState(input.previousState, "previousState");
  assertState(input.newState, "newState");
  assertMetadata(input.metadata);
  if (Number.isNaN(input.occurredAt.getTime()))
    throw new BingoAuditValidationError("occurredAt");
  if (
    input.retentionUntil !== undefined &&
    (Number.isNaN(input.retentionUntil.getTime()) ||
      input.retentionUntil < input.occurredAt)
  ) {
    throw new BingoAuditValidationError("retentionUntil");
  }
}
