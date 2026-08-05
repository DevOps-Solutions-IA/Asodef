import type { RetentionRecordCategory } from "@prisma/client";

export interface RetentionCandidate {
  recordId: string;
  createdAt: Date;
  ageDays: number;
}

export type RetentionCategoryReviewStatus = "not_configured" | "legal_hold" | "not_yet_available" | "reviewed";

export interface RetentionCategoryReview {
  category: RetentionRecordCategory;
  status: RetentionCategoryReviewStatus;
  retentionPeriodDays: number | null;
  legalHold: boolean;
  candidates: RetentionCandidate[];
}

export interface AnonymizationLogResponse {
  id: string;
  recordCategory: RetentionRecordCategory;
  recordId: string;
  action: string;
  reason: string;
  actorUserId: string | null;
  executedAt: Date;
}
