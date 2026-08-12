import type { Prisma } from "@prisma/client";

export const BINGO_OUTCOME_PERMISSIONS = {
  VALIDATE: "bingo.validate",
} as const;

export interface OutcomeActorContext {
  readonly userId: string;
  readonly permissions: ReadonlySet<string>;
}

export interface OutcomeCommandContext {
  readonly actor: OutcomeActorContext;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly now: Date;
}

export interface OutcomeOutboxSequenceAllocator {
  /** Called only while the transaction kernel owns the event row lock. */
  next(tx: Prisma.TransactionClient, eventId: string): Promise<bigint>;
}

export interface OutcomeLockManager {
  acquire(
    tx: Prisma.TransactionClient,
    scope: Readonly<{
      eventId: string;
      roundId?: string;
      executionId?: string;
      candidateIds?: readonly string[];
      winnerIds?: readonly string[];
    }>,
  ): Promise<void>;
}

export interface ValidateCandidateCommand {
  readonly eventId: string;
  readonly candidateId: string;
}

export interface RejectCandidateCommand extends ValidateCandidateCommand {
  readonly reason: string;
}

export interface ConfirmWinnerCommand {
  readonly eventId: string;
  readonly winGroupId: string;
}

export type CandidateCommandResult = Readonly<{
  candidateId: string;
  executionId: string;
  status: "VALIDATED" | "REJECTED";
  replayed: boolean;
}>;

export type ConfirmWinnersResult = Readonly<{
  winGroupId: string;
  executionId: string;
  winnerIds: readonly string[];
  policy: "SPLIT_PRIZE" | "FULL_PRIZE_EACH";
  replayed: boolean;
}>;
