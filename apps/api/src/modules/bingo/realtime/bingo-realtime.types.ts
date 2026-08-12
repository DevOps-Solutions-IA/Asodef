import type { BingoRealtimeSurface } from "../contracts/realtime";

export const BINGO_REDIS_OUTBOX_CHANNEL = "asodef:bingo:outbox:v1";
export const BINGO_REALTIME_REPLAY_LIMIT = 256;
export const BINGO_REALTIME_HEARTBEAT_MS = 20_000;

export interface BingoOutboxNotification {
  schemaVersion: 1;
  outboxEventId: string;
  eventId: string;
  sequence: number;
}

export interface BingoRealtimeAccess {
  eventId: string;
  eventSlug: string;
  surface: BingoRealtimeSurface;
  winnerDisplayNameAllowed: boolean;
}

export interface BingoRealtimeControlMessage {
  kind: "SNAPSHOT_REQUIRED" | "RESYNC_REQUIRED";
  reason:
    | "CURSOR_MISSING"
    | "CURSOR_NOT_FOUND"
    | "CURSOR_WRONG_STREAM"
    | "REPLAY_WINDOW_EXCEEDED";
  stream: string;
  latestEventId: string | null;
  latestSequence: number;
  snapshotUrl: string;
}
