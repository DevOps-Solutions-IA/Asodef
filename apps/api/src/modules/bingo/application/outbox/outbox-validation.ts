import type {
  BingoOutboxEventType,
  BingoOutboxPayloadByType,
} from "./outbox-contracts";
import { BINGO_OUTBOX_EVENT_TYPES } from "./outbox-contracts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROTOCOL_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class BingoOutboxValidationError extends Error {
  readonly code = "BINGO_OUTBOX_INVALID_PAYLOAD";

  constructor(readonly field: string) {
    super(`BINGO_OUTBOX_INVALID_PAYLOAD:${field}`);
    this.name = "BingoOutboxValidationError";
  }
}

function assertKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BingoOutboxValidationError("payload");
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw new BingoOutboxValidationError("payload.keys");
  }
}

function uuid(value: unknown, field: string): void {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new BingoOutboxValidationError(field);
  }
}

function positiveInteger(value: unknown, field: string, max?: number): void {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    (max !== undefined && Number(value) > max)
  ) {
    throw new BingoOutboxValidationError(field);
  }
}

function timestamp(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    !ISO_UTC.test(value) ||
    Number.isNaN(new Date(value).getTime()) ||
    new Date(value).toISOString() !== value
  ) {
    throw new BingoOutboxValidationError(field);
  }
}

export function assertOutboxPayload<T extends BingoOutboxEventType>(
  eventType: T,
  payload: unknown,
): asserts payload is BingoOutboxPayloadByType[T] {
  if (!(BINGO_OUTBOX_EVENT_TYPES as readonly string[]).includes(eventType)) {
    throw new BingoOutboxValidationError("eventType");
  }
  if (eventType.startsWith("bingo.execution.")) {
    assertKeys(
      payload,
      [
        "schemaVersion",
        "executionId",
        "roundId",
        "revision",
        "status",
        "occurredAt",
      ],
      ["previousExecutionId", "configurationHash", "fairnessProtocolVersion"],
    );
    if (payload.schemaVersion !== 1)
      throw new BingoOutboxValidationError("schemaVersion");
    uuid(payload.executionId, "executionId");
    uuid(payload.roundId, "roundId");
    positiveInteger(payload.revision, "revision");
    timestamp(payload.occurredAt, "occurredAt");
    if (payload.previousExecutionId !== undefined)
      uuid(payload.previousExecutionId, "previousExecutionId");
    if (
      payload.configurationHash !== undefined &&
      (typeof payload.configurationHash !== "string" ||
        !SHA256.test(payload.configurationHash))
    ) {
      throw new BingoOutboxValidationError("configurationHash");
    }
    if (
      payload.fairnessProtocolVersion !== undefined &&
      (typeof payload.fairnessProtocolVersion !== "string" ||
        !PROTOCOL_VERSION.test(payload.fairnessProtocolVersion))
    ) {
      throw new BingoOutboxValidationError("fairnessProtocolVersion");
    }
    const statusByType: Record<string, string> = {
      "bingo.execution.started.v1": "RUNNING",
      "bingo.execution.paused.v1": "PAUSED",
      "bingo.execution.resumed.v1": "RUNNING",
      "bingo.execution.cancelled.v1": "CANCELLED",
      "bingo.execution.completed.v1": "COMPLETED",
      "bingo.execution.restarted.v1": "PLANNED",
    };
    if (payload.status !== statusByType[eventType])
      throw new BingoOutboxValidationError("status");
    return;
  }
  if (eventType === "bingo.draw.created.v1") {
    assertKeys(payload, [
      "schemaVersion",
      "drawId",
      "executionId",
      "roundId",
      "sequence",
      "ballNumber",
      "stateVersion",
      "drawnAt",
    ]);
    if (payload.schemaVersion !== 1)
      throw new BingoOutboxValidationError("schemaVersion");
    uuid(payload.drawId, "drawId");
    uuid(payload.executionId, "executionId");
    uuid(payload.roundId, "roundId");
    positiveInteger(payload.sequence, "sequence", 75);
    positiveInteger(payload.ballNumber, "ballNumber", 75);
    positiveInteger(payload.stateVersion, "stateVersion");
    timestamp(payload.drawnAt, "drawnAt");
    return;
  }
  if (eventType.startsWith("bingo.candidate.")) {
    assertKeys(payload, [
      "schemaVersion",
      "candidateId",
      "executionId",
      "patternId",
      "decisiveDrawSequence",
      "decisiveBall",
      "status",
      "occurredAt",
    ]);
    if (payload.schemaVersion !== 1)
      throw new BingoOutboxValidationError("schemaVersion");
    uuid(payload.candidateId, "candidateId");
    uuid(payload.executionId, "executionId");
    uuid(payload.patternId, "patternId");
    positiveInteger(payload.decisiveDrawSequence, "decisiveDrawSequence", 75);
    positiveInteger(payload.decisiveBall, "decisiveBall", 75);
    timestamp(payload.occurredAt, "occurredAt");
    const statusByType: Record<string, string> = {
      "bingo.candidate.detected.v1": "PENDING",
      "bingo.candidate.validated.v1": "VALIDATED",
      "bingo.candidate.rejected.v1": "REJECTED",
    };
    if (payload.status !== statusByType[eventType])
      throw new BingoOutboxValidationError("status");
    return;
  }
  assertKeys(payload, [
    "schemaVersion",
    "winnerId",
    "executionId",
    "status",
    "occurredAt",
  ]);
  if (payload.schemaVersion !== 1 || payload.status !== "CONFIRMED")
    throw new BingoOutboxValidationError("status");
  uuid(payload.winnerId, "winnerId");
  uuid(payload.executionId, "executionId");
  timestamp(payload.occurredAt, "occurredAt");
}
