import type { ConsentRecord } from "@prisma/client";

/**
 * Exactly one subject per call, or explicitly anonymous. The DB CHECK
 * (relaxed to "at most one" by the US-046 bug-fix migration) already
 * permits zero subjects - that state exists for onDelete: SetNull
 * cascades, but is also exactly what a not-yet-identified website
 * visitor (US-047's cookie banner) needs: a real, intentional "no
 * subject" write, not a fallback. `anonymous: true` makes that call
 * explicit at the type level rather than silently omitting all three.
 */
export type RecordConsentSubject =
  | { userId: string; leadSubmissionId?: never; customerId?: never; anonymous?: never }
  | { leadSubmissionId: string; userId?: never; customerId?: never; anonymous?: never }
  | { customerId: string; userId?: never; leadSubmissionId?: never; anonymous?: never }
  | { anonymous: true; userId?: never; leadSubmissionId?: never; customerId?: never };

export interface RecordConsentRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  source: string;
  acceptanceMethod: string;
  /** Purpose-specific structured context (e.g. cookie category) - never
   * a substitute for the typed columns above, only supplementary. */
  metadata?: Record<string, unknown>;
}

export function subjectToRecordFields(subject: RecordConsentSubject): {
  userId?: string;
  leadSubmissionId?: string;
  customerId?: string;
} {
  if ("userId" in subject && subject.userId) return { userId: subject.userId };
  if ("leadSubmissionId" in subject && subject.leadSubmissionId) return { leadSubmissionId: subject.leadSubmissionId };
  if ("customerId" in subject && subject.customerId) return { customerId: subject.customerId };
  return {};
}

export interface ConsentRecordResponse {
  id: string;
  purposeKey: string;
  status: string;
  legalDocumentVersionId: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export function toConsentRecordResponse(record: ConsentRecord, purposeKey: string): ConsentRecordResponse {
  return {
    id: record.id,
    purposeKey,
    status: record.status,
    legalDocumentVersionId: record.legalDocumentVersionId,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  };
}
