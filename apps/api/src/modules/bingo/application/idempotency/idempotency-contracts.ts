import type { BingoCommandStatus } from "@prisma/client";

export const BINGO_MUTATING_OPERATIONS = [
  "START_EXECUTION",
  "PAUSE_EXECUTION",
  "RESUME_EXECUTION",
  "CANCEL_EXECUTION",
  "COMPLETE_EXECUTION",
  "DRAW_NEXT_BALL",
  "VALIDATE_CANDIDATE",
  "REJECT_CANDIDATE",
  "CONFIRM_WINNER",
  "RESTART_EXECUTION",
] as const;

export type BingoMutatingOperation = (typeof BINGO_MUTATING_OPERATIONS)[number];

export type BingoIdempotencyScope =
  | `event:${string}`
  | `round:${string}`
  | `execution:${string}`
  | `candidate:${string}`
  | `winner:${string}`;

export type BingoCommandResult = Readonly<{
  schemaVersion: 1;
  resourceType: "EXECUTION" | "DRAW" | "CANDIDATE" | "WINNER";
  resourceId: string;
  status: string;
  executionId?: string;
  revision?: number;
  sequence?: number;
  ballNumber?: number;
  candidateCount?: number;
}>;

export interface AcquireIdempotencyInput {
  eventId: string;
  executionId?: string;
  actorUserId: string;
  scope: BingoIdempotencyScope;
  operation: BingoMutatingOperation;
  idempotencyKey: string;
  request: unknown;
  now: Date;
  expiresAt?: Date;
}

export type IdempotencyAcquisition =
  | Readonly<{
      kind: "ACQUIRED";
      recordId: string;
      keyHash: string;
      requestHash: string;
      resumedRetry: boolean;
    }>
  | Readonly<{
      kind: "REPLAY";
      recordId: string;
      status: Exclude<BingoCommandStatus, "PROCESSING" | "FAILED_RETRYABLE">;
      result: BingoCommandResult;
    }>
  | Readonly<{
      kind: "IN_PROGRESS";
      retryAfterMs: number;
    }>;
