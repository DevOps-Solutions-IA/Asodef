import { Injectable } from "@nestjs/common";
import { AuditSource, type Prisma } from "@prisma/client";

export interface RecordAuditParams {
  paymentOrderId: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  /** False for an attempted-but-blocked transition (PRD negative case:
   * "still logs an audit entry indicating no-op, not silence"). */
  applied: boolean;
  source: AuditSource;
  metadata?: Prisma.InputJsonValue;
}

/**
 * US-028. Deliberately takes the same transaction client every other
 * payment-domain write in this story goes through, not PrismaService
 * directly - an audit row must commit atomically with the status
 * change/order it describes, never as an afterthought that could
 * succeed or fail independently of the thing it's auditing.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, params: RecordAuditParams): Promise<void> {
    await tx.auditLog.create({
      data: {
        paymentOrderId: params.paymentOrderId,
        action: params.action,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        applied: params.applied,
        source: params.source,
        metadata: params.metadata,
      },
    });
  }
}

export { AuditSource };
