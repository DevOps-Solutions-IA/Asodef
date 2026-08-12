import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import type { OutcomeOutboxSequenceAllocator } from "./outcome-contracts";

type NextSequenceRow = { next_sequence: bigint };

/**
 * The caller must own the BingoEvent FOR UPDATE lock. This makes MAX+1 safe
 * without introducing a second counter/source of truth; the unique DB index
 * remains the final guard against non-conforming writers.
 */
export class PrismaOutcomeOutboxSequenceAllocator implements OutcomeOutboxSequenceAllocator {
  async next(
    tx: PrismaTypes.TransactionClient,
    eventId: string,
  ): Promise<bigint> {
    const [row] = await tx.$queryRaw<NextSequenceRow[]>(Prisma.sql`
      SELECT COALESCE(MAX(sequence), 0)::bigint + 1 AS next_sequence
      FROM bingo_outbox_events
      WHERE event_id = ${eventId}::uuid
    `);
    return row?.next_sequence ?? 1n;
  }
}
