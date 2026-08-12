export const BINGO_OUTBOX_EVENT_TYPES = [
  "bingo.execution.started.v1",
  "bingo.execution.paused.v1",
  "bingo.execution.resumed.v1",
  "bingo.execution.cancelled.v1",
  "bingo.execution.completed.v1",
  "bingo.execution.restarted.v1",
  "bingo.draw.created.v1",
  "bingo.candidate.detected.v1",
  "bingo.candidate.validated.v1",
  "bingo.candidate.rejected.v1",
  "bingo.winner.confirmed.v1",
] as const;

export type BingoOutboxEventType = (typeof BINGO_OUTBOX_EVENT_TYPES)[number];

type ExecutionPayload = Readonly<{
  schemaVersion: 1;
  executionId: string;
  roundId: string;
  revision: number;
  status: "RUNNING" | "PAUSED" | "CANCELLED" | "COMPLETED" | "PLANNED";
  occurredAt: string;
  previousExecutionId?: string;
  configurationHash?: string;
  fairnessProtocolVersion?: string;
}>;

type DrawPayload = Readonly<{
  schemaVersion: 1;
  drawId: string;
  executionId: string;
  roundId: string;
  sequence: number;
  ballNumber: number;
  stateVersion: number;
  drawnAt: string;
}>;

type CandidatePayload = Readonly<{
  schemaVersion: 1;
  candidateId: string;
  executionId: string;
  patternId: string;
  decisiveDrawSequence: number;
  decisiveBall: number;
  status: "PENDING" | "VALIDATED" | "REJECTED";
  occurredAt: string;
}>;

type WinnerPayload = Readonly<{
  schemaVersion: 1;
  winnerId: string;
  executionId: string;
  status: "CONFIRMED";
  occurredAt: string;
}>;

export interface BingoOutboxPayloadByType {
  "bingo.execution.started.v1": ExecutionPayload;
  "bingo.execution.paused.v1": ExecutionPayload;
  "bingo.execution.resumed.v1": ExecutionPayload;
  "bingo.execution.cancelled.v1": ExecutionPayload;
  "bingo.execution.completed.v1": ExecutionPayload;
  "bingo.execution.restarted.v1": ExecutionPayload;
  "bingo.draw.created.v1": DrawPayload;
  "bingo.candidate.detected.v1": CandidatePayload;
  "bingo.candidate.validated.v1": CandidatePayload;
  "bingo.candidate.rejected.v1": CandidatePayload;
  "bingo.winner.confirmed.v1": WinnerPayload;
}

export interface AppendOutboxInput<T extends BingoOutboxEventType> {
  eventId: string;
  executionId?: string;
  /** Allocated by the transaction kernel while its event lock is held. */
  sequence: bigint;
  eventType: T;
  aggregateType: "EXECUTION" | "DRAW" | "CANDIDATE" | "WINNER";
  aggregateId: string;
  aggregateVersion: bigint;
  payload: BingoOutboxPayloadByType[T];
  createdAt: Date;
}
