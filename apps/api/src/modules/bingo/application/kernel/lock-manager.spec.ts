import type { Prisma } from "@prisma/client";
import { BINGO_CANONICAL_LOCK_ORDER, BingoLockManager } from "./lock-manager";

describe("BingoLockManager", () => {
  it("acquires every aggregate class in the documented canonical order", async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
        calls.push(parts.join("?"));
        return [];
      }),
    } as unknown as Prisma.TransactionClient;

    await new BingoLockManager().acquire(tx, {
      eventId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      executionId: "00000000-0000-0000-0000-000000000003",
      assignmentIds: ["00000000-0000-0000-0000-000000000006"],
      cardIds: ["00000000-0000-0000-0000-000000000005"],
      candidateIds: ["00000000-0000-0000-0000-000000000004"],
      winnerIds: ["00000000-0000-0000-0000-000000000007"],
    });

    expect(BINGO_CANONICAL_LOCK_ORDER).toEqual([
      "EVENT",
      "ROUND",
      "EXECUTION",
      "ASSIGNMENT",
      "CARD",
      "CANDIDATE",
      "WINNER",
    ]);
    expect(calls.map((query) => query.match(/FROM ([a-z_]+)/)?.[1])).toEqual([
      "bingo_events",
      "bingo_rounds",
      "bingo_round_executions",
      "bingo_card_assignments",
      "bingo_cards",
      "bingo_winner_candidates",
      "bingo_winners",
    ]);
  });
});
