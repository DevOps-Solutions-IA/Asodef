import { BingoOutboxStatus, Prisma } from "@prisma/client";
import type {
  AppendOutboxInput,
  BingoOutboxEventType,
} from "./outbox-contracts";
import { assertOutboxPayload } from "./outbox-validation";

export class PrismaBingoOutboxRepository {
  async append<T extends BingoOutboxEventType>(
    tx: Prisma.TransactionClient,
    input: AppendOutboxInput<T>,
  ): Promise<string> {
    if (input.sequence < 1n || input.aggregateVersion < 0n) {
      throw new RangeError("BINGO_OUTBOX_INVALID_SEQUENCE");
    }
    assertOutboxPayload(input.eventType, input.payload);
    const created = await tx.bingoOutboxEvent.create({
      data: {
        eventId: input.eventId,
        executionId: input.executionId,
        sequence: input.sequence,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        aggregateVersion: input.aggregateVersion,
        publicPayload: { ...input.payload } as Prisma.InputJsonObject,
        createdAt: input.createdAt,
      },
      select: { id: true },
    });
    return created.id;
  }

  /** Read-side only. Publishing/Redis/SSE deliberately remain out of ETAPA 5. */
  async readReady(tx: Prisma.TransactionClient, now: Date, take: number) {
    if (!Number.isInteger(take) || take < 1 || take > 500) {
      throw new RangeError("BINGO_OUTBOX_INVALID_BATCH_SIZE");
    }
    const rows = await tx.bingoOutboxEvent.findMany({
      where: {
        status: { in: [BingoOutboxStatus.PENDING, BingoOutboxStatus.FAILED] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    });
    for (const row of rows) {
      assertOutboxPayload(
        row.eventType as BingoOutboxEventType,
        row.publicPayload,
      );
    }
    return rows;
  }
}
