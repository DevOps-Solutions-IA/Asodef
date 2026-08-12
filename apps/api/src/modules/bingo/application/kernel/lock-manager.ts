import type { Prisma } from "@prisma/client";

export const BINGO_CANONICAL_LOCK_ORDER = [
  "EVENT",
  "ROUND",
  "EXECUTION",
  "ASSIGNMENT",
  "CARD",
  "CANDIDATE",
  "WINNER",
] as const;

export interface BingoLockScope {
  readonly eventId: string;
  readonly roundId?: string;
  readonly executionId?: string;
  readonly assignmentIds?: readonly string[];
  readonly cardIds?: readonly string[];
  readonly candidateIds?: readonly string[];
  readonly winnerIds?: readonly string[];
}

async function lockMany(
  tx: Prisma.TransactionClient,
  table:
    | "bingo_card_assignments"
    | "bingo_cards"
    | "bingo_winner_candidates"
    | "bingo_winners",
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)].sort();
  for (const id of unique) {
    if (table === "bingo_card_assignments") {
      await tx.$queryRaw`SELECT id FROM bingo_card_assignments WHERE id = ${id}::uuid FOR UPDATE`;
    } else if (table === "bingo_cards") {
      await tx.$queryRaw`SELECT id FROM bingo_cards WHERE id = ${id}::uuid FOR UPDATE`;
    } else if (table === "bingo_winner_candidates") {
      await tx.$queryRaw`SELECT id FROM bingo_winner_candidates WHERE id = ${id}::uuid FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT id FROM bingo_winners WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }
}

export class BingoLockManager {
  async acquire(
    tx: Prisma.TransactionClient,
    scope: BingoLockScope,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM bingo_events WHERE id = ${scope.eventId}::uuid FOR UPDATE`;
    if (scope.roundId !== undefined) {
      await tx.$queryRaw`SELECT id FROM bingo_rounds WHERE id = ${scope.roundId}::uuid AND event_id = ${scope.eventId}::uuid FOR UPDATE`;
    }
    if (scope.executionId !== undefined) {
      await tx.$queryRaw`SELECT id FROM bingo_round_executions WHERE id = ${scope.executionId}::uuid AND event_id = ${scope.eventId}::uuid FOR UPDATE`;
    }
    await lockMany(tx, "bingo_card_assignments", scope.assignmentIds ?? []);
    await lockMany(tx, "bingo_cards", scope.cardIds ?? []);
    await lockMany(tx, "bingo_winner_candidates", scope.candidateIds ?? []);
    await lockMany(tx, "bingo_winners", scope.winnerIds ?? []);
  }
}
