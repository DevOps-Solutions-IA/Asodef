import type { BingoAuditResult } from "@prisma/client";

export const BINGO_AUDIT_ACTIONS = [
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

export type BingoAuditAction = (typeof BINGO_AUDIT_ACTIONS)[number];
export type BingoActorPermission =
  "bingo.operate" | "bingo.validate" | "bingo.manage";

export type BingoAuditState = Readonly<{
  status?: string;
  revision?: number;
  sequence?: number;
  ballNumber?: number;
  stateVersion?: number;
}>;

export type BingoAuditMetadata = Readonly<{
  schemaVersion: 1;
  entityId: string;
  previousExecutionId?: string;
  sequence?: number;
  ballNumber?: number;
  revision?: number;
  candidateCount?: number;
  winnerCount?: number;
  retryCount?: number;
  policy?: string;
}>;

export interface AppendAuditInput {
  eventId: string;
  roundId?: string;
  executionId?: string;
  actorUserId: string;
  actorPermission: BingoActorPermission;
  action: BingoAuditAction;
  result: BingoAuditResult;
  reason?: string;
  previousState?: BingoAuditState;
  newState?: BingoAuditState;
  requestId: string;
  idempotencyKeyHash?: string;
  ipHash?: string;
  userAgentHash?: string;
  metadata: BingoAuditMetadata;
  occurredAt: Date;
  retentionUntil?: Date;
}
