import type { ConsentRecord } from "@prisma/client";

/** Exactly one subject per call - mirrors the consent_records table's
 * own exactly-one-subject CHECK constraint (US-046). */
export type RecordConsentSubject =
  | { userId: string; leadSubmissionId?: never; customerId?: never }
  | { leadSubmissionId: string; userId?: never; customerId?: never }
  | { customerId: string; userId?: never; leadSubmissionId?: never };

export interface RecordConsentRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  source: string;
  acceptanceMethod: string;
}

export function subjectToRecordFields(subject: RecordConsentSubject): {
  userId?: string;
  leadSubmissionId?: string;
  customerId?: string;
} {
  if ("userId" in subject && subject.userId) return { userId: subject.userId };
  if ("leadSubmissionId" in subject && subject.leadSubmissionId) return { leadSubmissionId: subject.leadSubmissionId };
  return { customerId: (subject as { customerId: string }).customerId };
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
