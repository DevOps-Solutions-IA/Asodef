export const BINGO_REALTIME_EVENT_CATALOG = Object.freeze({
  "bingo.execution.started.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.execution.paused.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.execution.resumed.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.execution.cancelled.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.execution.completed.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.execution.restarted.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.draw.created.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
  "bingo.candidate.detected.v1": ["ADMIN"],
  "bingo.candidate.validated.v1": ["ADMIN"],
  "bingo.candidate.rejected.v1": ["ADMIN"],
  "bingo.winner.confirmed.v1": ["PUBLIC", "AFFILIATE", "ADMIN"],
} as const);

export const BINGO_REALTIME_EVENT_TYPES = Object.freeze(
  Object.keys(BINGO_REALTIME_EVENT_CATALOG) as BingoRealtimeEventType[],
);

export type BingoRealtimeEventType = keyof typeof BINGO_REALTIME_EVENT_CATALOG;
export type BingoRealtimeSurface = "PUBLIC" | "AFFILIATE" | "ADMIN";

export interface BingoRealtimeEnvelopeContract<
  T extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  /** UUID of the authoritative PostgreSQL outbox row. */
  id: string;
  type: BingoRealtimeEventType;
  /** Opaque, non-PII stream token. It must not contain an Affiliate/User id. */
  stream: string;
  /** Event-scoped PostgreSQL outbox sequence. */
  sequence: number;
  occurredAt: string;
  surface: BingoRealtimeSurface;
  data: T;
}

export interface BingoDrawCreatedPayloadContract extends Readonly<
  Record<string, unknown>
> {
  schemaVersion: 1;
  eventSlug: string;
  roundOrder: number;
  revision: number;
  drawSequence: number;
  ball: number;
  drawnAt: string;
}

export interface BingoWinnerConfirmedPublicPayloadContract extends Readonly<
  Record<string, unknown>
> {
  schemaVersion: 1;
  eventSlug: string;
  roundOrder: number;
  cardNumber: string;
  displayName?: string;
  confirmedAt: string;
}

export interface BingoRealtimeCursorContract {
  stream: string;
  lastEventId: string | null;
  lastSequence: number;
}

export interface BingoRealtimeSnapshotCursorContract extends BingoRealtimeCursorContract {
  generatedAt: string;
  executionRevision: number | null;
}

export type BingoRealtimeResumeDecision =
  | { kind: "CONTINUE"; acceptSequence: number; acceptEventId: string }
  | {
      kind: "IGNORE_DUPLICATE";
      acceptSequence: number;
      acceptEventId: string | null;
    }
  | {
      kind: "RESYNC_REQUIRED";
      reason: "STREAM_CHANGED" | "SEQUENCE_GAP" | "EVENT_ID_CONFLICT";
      expectedSequence: number;
      receivedSequence: number;
    };

export function decideBingoRealtimeResume(
  cursor: BingoRealtimeCursorContract,
  event: Pick<BingoRealtimeEnvelopeContract, "id" | "stream" | "sequence">,
): BingoRealtimeResumeDecision {
  if (event.stream !== cursor.stream) {
    return {
      kind: "RESYNC_REQUIRED",
      reason: "STREAM_CHANGED",
      expectedSequence: cursor.lastSequence + 1,
      receivedSequence: event.sequence,
    };
  }
  if (
    event.sequence === cursor.lastSequence &&
    cursor.lastEventId !== null &&
    event.id !== cursor.lastEventId
  ) {
    return {
      kind: "RESYNC_REQUIRED",
      reason: "EVENT_ID_CONFLICT",
      expectedSequence: cursor.lastSequence,
      receivedSequence: event.sequence,
    };
  }
  if (event.sequence <= cursor.lastSequence) {
    return {
      kind: "IGNORE_DUPLICATE",
      acceptSequence: cursor.lastSequence,
      acceptEventId: cursor.lastEventId,
    };
  }
  if (event.sequence !== cursor.lastSequence + 1) {
    return {
      kind: "RESYNC_REQUIRED",
      reason: "SEQUENCE_GAP",
      expectedSequence: cursor.lastSequence + 1,
      receivedSequence: event.sequence,
    };
  }
  return {
    kind: "CONTINUE",
    acceptSequence: event.sequence,
    acceptEventId: event.id,
  };
}

export interface BingoRealtimeReplayWindowContract {
  stream: string;
  earliestRetainedSequence: number;
  latestSequence: number;
  latestEventId: string | null;
}

export type BingoRealtimeReplayDecision =
  | { kind: "SNAPSHOT_REQUIRED"; reason: "CURSOR_MISSING" }
  | {
      kind: "RESYNC_REQUIRED";
      reason:
        | "STREAM_CHANGED"
        | "CURSOR_AHEAD"
        | "CURSOR_EXPIRED"
        | "EVENT_ID_CONFLICT";
    }
  | { kind: "REPLAY"; fromSequence: number }
  | { kind: "WAIT"; afterSequence: number };

/**
 * Operates on a cursor already resolved from PostgreSQL by Last-Event-ID. The
 * future SSE adapter must not trust a sequence supplied directly by a client.
 */
export function decideBingoRealtimeReplay(
  cursor: BingoRealtimeCursorContract | null,
  window: BingoRealtimeReplayWindowContract,
): BingoRealtimeReplayDecision {
  if (cursor === null) {
    return { kind: "SNAPSHOT_REQUIRED", reason: "CURSOR_MISSING" };
  }
  if (cursor.stream !== window.stream) {
    return { kind: "RESYNC_REQUIRED", reason: "STREAM_CHANGED" };
  }
  if (cursor.lastSequence > window.latestSequence) {
    return { kind: "RESYNC_REQUIRED", reason: "CURSOR_AHEAD" };
  }
  if (cursor.lastSequence < window.earliestRetainedSequence - 1) {
    return { kind: "RESYNC_REQUIRED", reason: "CURSOR_EXPIRED" };
  }
  if (
    cursor.lastSequence === window.latestSequence &&
    cursor.lastEventId !== window.latestEventId
  ) {
    return { kind: "RESYNC_REQUIRED", reason: "EVENT_ID_CONFLICT" };
  }
  if (cursor.lastSequence === window.latestSequence) {
    return { kind: "WAIT", afterSequence: window.latestSequence };
  }
  return { kind: "REPLAY", fromSequence: cursor.lastSequence + 1 };
}

export const BINGO_REALTIME_SURFACE_POLICY = Object.freeze({
  PUBLIC: {
    authentication: "NONE",
    visibilityRequired: "PUBLIC",
    authorization: "EVENT_PUBLIC_REALTIME_ENABLED",
    includesCardLayout: false,
    includesCandidate: false,
  },
  AFFILIATE: {
    authentication: "SELF_SERVICE_AFFILIATE",
    visibilityRequired: null,
    authorization: "CURRENT_EVENT_PARTICIPATION",
    includesCardLayout: true,
    includesCandidate: false,
  },
  ADMIN: {
    authentication: "ADMIN_SESSION_AND_PERMISSION",
    visibilityRequired: null,
    authorization: "BINGO_READ_OR_OPERATION_PERMISSION",
    includesCardLayout: false,
    includesCandidate: true,
  },
} as const);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STREAM = /^(public|affiliate|admin):[A-Za-z0-9._~-]{1,128}$/;

export class BingoRealtimeContractError extends Error {
  readonly code = "BINGO_REALTIME_CONTRACT_INVALID";

  constructor(readonly field: string) {
    super(`BINGO_REALTIME_CONTRACT_INVALID:${field}`);
    this.name = "BingoRealtimeContractError";
  }
}

export function parseBingoLastEventId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 64 || !UUID.test(value)) {
    throw new BingoRealtimeContractError("Last-Event-ID");
  }
  return value.toLowerCase();
}

const REALTIME_FORBIDDEN_KEYS = new Set([
  "document",
  "documentNumber",
  "phone",
  "email",
  "address",
  "subjectRef",
  "affiliateId",
  "participantId",
  "seed",
  "secretSeed",
  "seedCiphertext",
  "custodyKeyId",
  "requestHash",
  "idempotencyKey",
]);

const EXECUTION_FIELDS = [
  "schemaVersion",
  "eventSlug",
  "roundOrder",
  "revision",
  "status",
  "occurredAt",
] as const;
const DRAW_FIELDS = [
  "schemaVersion",
  "eventSlug",
  "roundOrder",
  "revision",
  "drawSequence",
  "ball",
  "drawnAt",
] as const;
const CANDIDATE_FIELDS = [
  "schemaVersion",
  "candidateId",
  "executionId",
  "patternId",
  "decisiveDrawSequence",
  "decisiveBall",
  "status",
  "occurredAt",
] as const;
const WINNER_FIELDS = [
  "schemaVersion",
  "eventSlug",
  "roundOrder",
  "cardNumber",
  "displayName",
  "confirmedAt",
] as const;
const ADMIN_EXECUTION_FIELDS = ["eventId", "roundId", "executionId"] as const;
const ADMIN_DRAW_FIELDS = [
  "eventId",
  "roundId",
  "executionId",
  "drawId",
  "stateVersion",
] as const;
const ADMIN_WINNER_FIELDS = ["winnerId", "executionId"] as const;

function allowedPayloadFields(
  type: BingoRealtimeEventType,
  surface: BingoRealtimeSurface,
): readonly string[] {
  if (type.startsWith("bingo.execution.")) {
    return surface === "ADMIN"
      ? [...EXECUTION_FIELDS, ...ADMIN_EXECUTION_FIELDS]
      : EXECUTION_FIELDS;
  }
  if (type === "bingo.draw.created.v1") {
    return surface === "ADMIN"
      ? [...DRAW_FIELDS, ...ADMIN_DRAW_FIELDS]
      : DRAW_FIELDS;
  }
  if (type.startsWith("bingo.candidate.")) return CANDIDATE_FIELDS;
  return surface === "ADMIN"
    ? [...WINNER_FIELDS, ...ADMIN_WINNER_FIELDS]
    : WINNER_FIELDS;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key))
      throw new BingoRealtimeContractError(`data.${key}`);
  }
  for (const key of allowed) {
    if (key === "displayName") continue;
    if (!(key in value)) throw new BingoRealtimeContractError(`data.${key}`);
  }
}

export function assertBingoRealtimePayloadSafe(
  payload: Readonly<Record<string, unknown>>,
): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (REALTIME_FORBIDDEN_KEYS.has(key)) {
        throw new BingoRealtimeContractError(`data.${key}`);
      }
      visit(child);
    }
  };
  visit(payload);
}

export function assertBingoRealtimeEnvelope(
  envelope: BingoRealtimeEnvelopeContract,
): void {
  const keys = Object.keys(envelope);
  const envelopeKeys = [
    "id",
    "type",
    "stream",
    "sequence",
    "occurredAt",
    "surface",
    "data",
  ];
  if (
    keys.length !== envelopeKeys.length ||
    keys.some((key) => !envelopeKeys.includes(key))
  ) {
    throw new BingoRealtimeContractError("envelope.keys");
  }
  if (!UUID.test(envelope.id)) throw new BingoRealtimeContractError("id");
  if (
    !(BINGO_REALTIME_EVENT_TYPES as readonly string[]).includes(envelope.type)
  ) {
    throw new BingoRealtimeContractError("type");
  }
  if (!STREAM.test(envelope.stream)) {
    throw new BingoRealtimeContractError("stream");
  }
  if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1) {
    throw new BingoRealtimeContractError("sequence");
  }
  if (
    !ISO_UTC.test(envelope.occurredAt) ||
    Number.isNaN(new Date(envelope.occurredAt).getTime()) ||
    new Date(envelope.occurredAt).toISOString() !== envelope.occurredAt
  ) {
    throw new BingoRealtimeContractError("occurredAt");
  }
  const prefix = envelope.stream.slice(0, envelope.stream.indexOf(":"));
  if (prefix !== envelope.surface.toLowerCase()) {
    throw new BingoRealtimeContractError("stream.surface");
  }
  const allowedSurfaces = BINGO_REALTIME_EVENT_CATALOG[envelope.type];
  if (!(allowedSurfaces as readonly string[]).includes(envelope.surface)) {
    throw new BingoRealtimeContractError("surface");
  }
  if (
    !envelope.data ||
    typeof envelope.data !== "object" ||
    Array.isArray(envelope.data)
  ) {
    throw new BingoRealtimeContractError("data");
  }
  assertBingoRealtimePayloadSafe(envelope.data);
  assertExactKeys(
    envelope.data,
    allowedPayloadFields(envelope.type, envelope.surface),
  );
  if (envelope.data.schemaVersion !== 1) {
    throw new BingoRealtimeContractError("data.schemaVersion");
  }
}
