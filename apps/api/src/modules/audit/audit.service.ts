import { Injectable } from "@nestjs/common";
import { AuditEventResult, AuditSource, type Prisma } from "@prisma/client";

interface RecordAuditBase {
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  /** False for an attempted-but-blocked transition (PRD negative case:
   * "still logs an audit entry indicating no-op, not silence"). */
  applied: boolean;
  source: AuditSource;
  /** Who performed a MANUAL (human-triggered) action - the payment
   * domain's own automated sources (webhook/poll/order-create/bold-
   * create) never set this; legal-workflow actions (US-043), always
   * human-triggered, always do. */
  actorUserId?: string;
  /** Explicit structured context. Optional for source compatibility; when
   * result is omitted the historic `applied` signal maps losslessly. */
  result?: AuditEventResult;
  reason?: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Exactly one entity reference per call - matches the audit_logs
 * table's own exactly-one-entity CHECK constraint (US-043, extended to
 * a 3rd domain in US-048, a 4th in US-050, a 5th in US-051, a 6th in
 * US-056, and a 7th in US-074). */
export type RecordAuditParams =
  | (RecordAuditBase & {
      paymentOrderId: string;
      legalDocumentVersionId?: never;
      dataSubjectRequestId?: never;
      pqrCaseId?: never;
      opportunityId?: never;
      refundId?: never;
      companyId?: never;
    })
  | (RecordAuditBase & {
      legalDocumentVersionId: string;
      paymentOrderId?: never;
      dataSubjectRequestId?: never;
      pqrCaseId?: never;
      opportunityId?: never;
      refundId?: never;
      companyId?: never;
    })
  | (RecordAuditBase & {
      dataSubjectRequestId: string;
      paymentOrderId?: never;
      legalDocumentVersionId?: never;
      pqrCaseId?: never;
      opportunityId?: never;
      refundId?: never;
      companyId?: never;
    })
  | (RecordAuditBase & {
      pqrCaseId: string;
      paymentOrderId?: never;
      legalDocumentVersionId?: never;
      dataSubjectRequestId?: never;
      opportunityId?: never;
      refundId?: never;
      companyId?: never;
    })
  | (RecordAuditBase & {
      opportunityId: string;
      paymentOrderId?: never;
      legalDocumentVersionId?: never;
      dataSubjectRequestId?: never;
      pqrCaseId?: never;
      refundId?: never;
      companyId?: never;
    })
  | (RecordAuditBase & {
      refundId: string;
      paymentOrderId?: never;
      legalDocumentVersionId?: never;
      dataSubjectRequestId?: never;
      pqrCaseId?: never;
      opportunityId?: never;
      companyId?: never;
    })
  | (RecordAuditBase & {
      companyId: string;
      paymentOrderId?: never;
      legalDocumentVersionId?: never;
      dataSubjectRequestId?: never;
      pqrCaseId?: never;
      opportunityId?: never;
      refundId?: never;
    });

/**
 * US-028 (payment domain), generalized in US-043 to also cover the
 * legal-document domain. Deliberately takes the same transaction
 * client every other domain write already goes through, not
 * PrismaService directly - an audit row must commit atomically with
 * the status change/order/version it describes, never as an
 * afterthought that could succeed or fail independently of the thing
 * it's auditing.
 */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, params: RecordAuditParams): Promise<void> {
    await tx.auditLog.create({
      data: {
        paymentOrderId: params.paymentOrderId,
        legalDocumentVersionId: params.legalDocumentVersionId,
        dataSubjectRequestId: params.dataSubjectRequestId,
        pqrCaseId: params.pqrCaseId,
        opportunityId: params.opportunityId,
        refundId: params.refundId,
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: params.action,
        result: params.result ?? (params.applied ? AuditEventResult.SUCCESS : AuditEventResult.NO_OP),
        reason: params.reason,
        requestId: params.requestId,
        correlationId: params.correlationId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
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
