import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AnonymizationAction, RetentionRecordCategory } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type {
  AnonymizationLogResponse,
  RetentionCategoryReview,
} from "./retention-review.types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface CandidateRow {
  id: string;
  createdAt: Date;
}

type CandidateFinder = (prisma: PrismaService, cutoff: Date) => Promise<CandidateRow[]>;

const PAYMENT_ORDER_ADMINISTRATIVE_STATUSES = ["DRAFT", "PENDING", "PROCESSING", "EXPIRED", "CANCELLED"] as const;
const PAYMENT_ORDER_APPROVED_STATUSES = ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
const PAYMENT_ORDER_FAILED_STATUSES = ["REJECTED", "FAILED"] as const;

/**
 * Only the categories with a real, already-built underlying model get a
 * finder. OPPORTUNITIES/CONTRACTS/PQR_CASES/DOCUMENTS have no Prisma
 * model yet (later CRM/contracts/PQR/document-management stories) -
 * reported as "not_yet_available" by review(), never silently treated
 * as "reviewed, nothing found" (which would be misleading).
 *
 * PAYMENT_ORDERS / APPROVED_TRANSACTIONS / FAILED_TRANSACTIONS are 3
 * non-overlapping slices of the same PaymentOrder table, partitioned by
 * PaymentOrderStatus (the confirmed internal vocabulary, US-022 - never
 * Bold's own unconfirmed raw status string) - not given explicitly by
 * the AC, but a defensible partition: "administrative" states that
 * never resulted in money moving either way, vs. approved (including
 * refunded - still approved historically), vs. failed.
 */
const CANDIDATE_FINDERS: Partial<Record<RetentionRecordCategory, CandidateFinder>> = {
  LEADS: (prisma, cutoff) => prisma.leadSubmission.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true, createdAt: true } }),
  PAYMENT_ORDERS: (prisma, cutoff) =>
    prisma.paymentOrder.findMany({
      where: { createdAt: { lt: cutoff }, status: { in: [...PAYMENT_ORDER_ADMINISTRATIVE_STATUSES] } },
      select: { id: true, createdAt: true },
    }),
  APPROVED_TRANSACTIONS: (prisma, cutoff) =>
    prisma.paymentOrder.findMany({
      where: { createdAt: { lt: cutoff }, status: { in: [...PAYMENT_ORDER_APPROVED_STATUSES] } },
      select: { id: true, createdAt: true },
    }),
  FAILED_TRANSACTIONS: (prisma, cutoff) =>
    prisma.paymentOrder.findMany({
      where: { createdAt: { lt: cutoff }, status: { in: [...PAYMENT_ORDER_FAILED_STATUSES] } },
      select: { id: true, createdAt: true },
    }),
  RECEIPTS: async (prisma, cutoff) => {
    const rows = await prisma.paymentReceipt.findMany({ where: { issuedAt: { lt: cutoff } }, select: { id: true, issuedAt: true } });
    return rows.map((row) => ({ id: row.id, createdAt: row.issuedAt }));
  },
  AUDIT_LOGS: (prisma, cutoff) => prisma.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true, createdAt: true } }),
  CONSENT_RECORDS: (prisma, cutoff) => prisma.consentRecord.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true, createdAt: true } }),
};

function toAnonymizationLogResponse(log: {
  id: string;
  recordCategory: RetentionRecordCategory;
  recordId: string;
  action: AnonymizationAction;
  reason: string;
  actorUserId: string | null;
  executedAt: Date;
}): AnonymizationLogResponse {
  return {
    id: log.id,
    recordCategory: log.recordCategory,
    recordId: log.recordId,
    action: log.action,
    reason: log.reason,
    actorUserId: log.actorUserId,
    executedAt: log.executedAt,
  };
}

@Injectable()
export class RetentionReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only - never deletes or anonymizes anything itself (AC's own
   * Example: "flags it for review without auto-deleting anything
   * without approval"). This method IS the "runnable on-demand for
   * verification" the AC explicitly allows in place of a wired
   * scheduler - no cron/worker infrastructure exists anywhere in this
   * codebase yet, so this is intentionally callable directly (via the
   * admin GET endpoint) rather than only from a scheduled job; a real
   * nightly schedule would call this exact same method.
   */
  async review(): Promise<RetentionCategoryReview[]> {
    const policies = await this.prisma.retentionPolicy.findMany({ orderBy: { recordCategory: "asc" } });
    const results: RetentionCategoryReview[] = [];

    for (const policy of policies) {
      if (policy.legalHold) {
        results.push({
          category: policy.recordCategory,
          status: "legal_hold",
          retentionPeriodDays: policy.retentionPeriodDays,
          legalHold: true,
          candidates: [],
        });
        continue;
      }

      if (policy.retentionPeriodDays == null) {
        results.push({
          category: policy.recordCategory,
          status: "not_configured",
          retentionPeriodDays: null,
          legalHold: false,
          candidates: [],
        });
        continue;
      }

      const finder = CANDIDATE_FINDERS[policy.recordCategory];
      if (!finder) {
        results.push({
          category: policy.recordCategory,
          status: "not_yet_available",
          retentionPeriodDays: policy.retentionPeriodDays,
          legalHold: false,
          candidates: [],
        });
        continue;
      }

      const cutoff = new Date(Date.now() - policy.retentionPeriodDays * DAY_MS);
      const rows = await finder(this.prisma, cutoff);

      results.push({
        category: policy.recordCategory,
        status: "reviewed",
        retentionPeriodDays: policy.retentionPeriodDays,
        legalHold: false,
        candidates: rows.map((row) => ({
          recordId: row.id,
          createdAt: row.createdAt,
          ageDays: Math.floor((Date.now() - row.createdAt.getTime()) / DAY_MS),
        })),
      });
    }

    return results;
  }

  /**
   * The one and only execution path - always an explicit admin
   * approval (AC), always writes AnonymizationLog as evidence. Only
   * LEADS has a real anonymization transform wired: the other 10
   * categories' PII/financial/audit-evidence fields each need their
   * own carefully considered redaction design (which fields are safe
   * to null without breaking referential/evidentiary integrity,
   * especially for financial and audit records) that isn't invented
   * here - they get an explicit "not yet implemented" rejection rather
   * than a guessed-at transform.
   */
  async approveAndExecute(
    category: RetentionRecordCategory,
    recordId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AnonymizationLogResponse> {
    const policy = await this.prisma.retentionPolicy.findUnique({ where: { recordCategory: category } });
    if (!policy) {
      throw new NotFoundException("No se encontró la política de retención para esta categoría.");
    }
    if (policy.legalHold) {
      throw new ConflictException(`La categoría "${category}" está bajo retención legal y no puede anonimizarse.`);
    }
    if (policy.retentionPeriodDays == null) {
      throw new BadRequestException(`La categoría "${category}" no tiene un período de retención configurado.`);
    }
    if (category !== RetentionRecordCategory.LEADS) {
      throw new BadRequestException(`La anonimización aún no está implementada para la categoría "${category}".`);
    }

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.leadSubmission.findUnique({ where: { id: recordId } });
      if (!lead) {
        throw new NotFoundException("No se encontró el registro indicado.");
      }

      const ageDays = Math.floor((Date.now() - lead.createdAt.getTime()) / DAY_MS);
      if (ageDays < policy.retentionPeriodDays!) {
        throw new ConflictException("El registro ya no cumple el criterio de retención.");
      }

      await tx.leadSubmission.update({
        where: { id: recordId },
        data: {
          fullName: "[ANONIMIZADO]",
          email: `anonimizado+${recordId}@anonimizado.local`,
          phone: "[ANONIMIZADO]",
          message: "[ANONIMIZADO]",
        },
      });

      const log = await tx.anonymizationLog.create({
        data: { recordCategory: category, recordId, action: AnonymizationAction.ANONYMIZED, reason, actorUserId },
      });

      return toAnonymizationLogResponse(log);
    });
  }
}
