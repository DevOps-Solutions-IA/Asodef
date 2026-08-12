import { Prisma } from "@prisma/client";
import type { AppendAuditInput } from "./audit-contracts";
import { assertAuditInput } from "./audit-validation";

/**
 * Append-only operational audit. Because this accepts only the command's
 * TransactionClient, SUCCEEDED can never survive rollback independently of
 * the state change it describes.
 */
export class PrismaBingoAuditRepository {
  async append(
    tx: Prisma.TransactionClient,
    input: AppendAuditInput,
  ): Promise<string> {
    assertAuditInput(input);
    const created = await tx.bingoAuditEvent.create({
      data: {
        eventId: input.eventId,
        roundId: input.roundId,
        executionId: input.executionId,
        actorUserId: input.actorUserId,
        actorPermission: input.actorPermission,
        action: input.action,
        result: input.result,
        reason: input.reason,
        previousState: input.previousState
          ? ({ ...input.previousState } as Prisma.InputJsonObject)
          : undefined,
        newState: input.newState
          ? ({ ...input.newState } as Prisma.InputJsonObject)
          : undefined,
        requestId: input.requestId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        metadata: { ...input.metadata } as Prisma.InputJsonObject,
        createdAt: input.occurredAt,
        retentionUntil: input.retentionUntil,
      },
      select: { id: true },
    });
    return created.id;
  }
}
