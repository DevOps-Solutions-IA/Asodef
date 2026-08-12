export const BINGO_REALTIME_EVENT_TYPES = [
  "bingo.execution.started.v1",
  "bingo.execution.paused.v1",
  "bingo.execution.resumed.v1",
  "bingo.execution.cancelled.v1",
  "bingo.execution.completed.v1",
  "bingo.draw.created.v1",
  "bingo.candidate.detected.v1",
  "bingo.candidate.validated.v1",
  "bingo.winner.confirmed.v1",
] as const;

export type BingoRealtimeEventType = (typeof BINGO_REALTIME_EVENT_TYPES)[number];
export type BingoRealtimeSurface = "PUBLIC" | "AFFILIATE" | "ADMIN";

export interface BingoRealtimeEnvelopeContract<T extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  id: string;
  type: BingoRealtimeEventType;
  stream: string;
  sequence: number;
  occurredAt: string;
  surface: BingoRealtimeSurface;
  data: T;
}

export interface BingoDrawCreatedPayloadContract extends Readonly<Record<string, unknown>> {
  eventSlug: string;
  roundOrder: number;
  revision: number;
  drawSequence: number;
  ball: number;
  drawnAt: string;
}

export interface BingoWinnerConfirmedPublicPayloadContract extends Readonly<Record<string, unknown>> {
  eventSlug: string;
  roundOrder: number;
  cardNumber: number;
  displayName?: string;
  confirmedAt: string;
}

export interface BingoRealtimeCursorContract {
  stream: string;
  lastEventId: string | null;
  lastSequence: number;
}

export type BingoRealtimeResumeDecision =
  | { kind: "CONTINUE"; acceptSequence: number }
  | { kind: "IGNORE_DUPLICATE"; acceptSequence: number }
  | { kind: "RESYNC_REQUIRED"; expectedSequence: number; receivedSequence: number };

export function decideBingoRealtimeResume(
  cursor: BingoRealtimeCursorContract,
  event: Pick<BingoRealtimeEnvelopeContract, "stream" | "sequence">,
): BingoRealtimeResumeDecision {
  if (event.stream !== cursor.stream) {
    return { kind: "RESYNC_REQUIRED", expectedSequence: cursor.lastSequence + 1, receivedSequence: event.sequence };
  }
  if (event.sequence <= cursor.lastSequence) return { kind: "IGNORE_DUPLICATE", acceptSequence: cursor.lastSequence };
  if (event.sequence !== cursor.lastSequence + 1) {
    return { kind: "RESYNC_REQUIRED", expectedSequence: cursor.lastSequence + 1, receivedSequence: event.sequence };
  }
  return { kind: "CONTINUE", acceptSequence: event.sequence };
}

export const BINGO_REALTIME_SURFACE_POLICY = Object.freeze({
  PUBLIC: { authentication: "NONE", visibilityRequired: "PUBLIC", includesCardLayout: false, includesCandidate: false },
  AFFILIATE: { authentication: "SELF_SERVICE_AFFILIATE", visibilityRequired: null, includesCardLayout: true, includesCandidate: false },
  ADMIN: { authentication: "ADMIN_SESSION_AND_PERMISSION", visibilityRequired: null, includesCardLayout: false, includesCandidate: true },
} as const);

const REALTIME_FORBIDDEN_KEYS = new Set([
  "document", "documentNumber", "phone", "email", "address", "subjectRef", "affiliateId", "participantId", "secretSeed", "seed",
]);

export function assertBingoRealtimePayloadSafe(payload: Readonly<Record<string, unknown>>): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (REALTIME_FORBIDDEN_KEYS.has(key)) throw new Error(`BINGO_REALTIME_FIELD_FORBIDDEN:${key}`);
      visit(child);
    }
  };
  visit(payload);
}

