import { RetentionRecordCategory } from "@prisma/client";

/**
 * US-049: all 11 literal categories from the AC, seeded with
 * retentionPeriodDays = null (unconfigured) and legalHold = false. No
 * real retention period is confirmed anywhere in the PRD - inventing
 * one (a specific day-count for any category) would be exactly the
 * kind of unconfirmed legal/regulatory determination this project
 * never fabricates. A category with no configured period is never
 * flagged by the retention-review job; the mechanism is real and
 * tested (see retention-review.service.integration.spec.ts), but
 * inert by default until compliance provides real numbers for each
 * category.
 */
export const RETENTION_POLICY_CATEGORIES: readonly RetentionRecordCategory[] = [
  RetentionRecordCategory.LEADS,
  RetentionRecordCategory.OPPORTUNITIES,
  RetentionRecordCategory.CONTRACTS,
  RetentionRecordCategory.PAYMENT_ORDERS,
  RetentionRecordCategory.APPROVED_TRANSACTIONS,
  RetentionRecordCategory.FAILED_TRANSACTIONS,
  RetentionRecordCategory.RECEIPTS,
  RetentionRecordCategory.PQR_CASES,
  RetentionRecordCategory.AUDIT_LOGS,
  RetentionRecordCategory.DOCUMENTS,
  RetentionRecordCategory.CONSENT_RECORDS,
] as const;
