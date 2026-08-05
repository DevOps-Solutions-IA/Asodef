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

/** US-062: /admin/consentimientos's full evidence view - "policy
 * version, ip, timestamp, method" from the AC, plus which of the three
 * discriminated subject fields this record actually belongs to. */
export interface AdminConsentRecordResponse {
  id: string;
  purposeKey: string;
  status: string;
  subjectType: "user" | "leadSubmission" | "customer" | "anonymous";
  subjectId: string | null;
  legalDocumentVersionId: string | null;
  policyVersionNumber: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  source: string;
  acceptanceMethod: string;
  createdAt: Date;
  revokedAt: Date | null;
}

type ConsentRecordWithRelations = ConsentRecord & {
  consentPurpose: { key: string };
  legalDocumentVersion: { version: number } | null;
};

export function toAdminConsentRecordResponse(record: ConsentRecordWithRelations): AdminConsentRecordResponse {
  const subjectType = record.userId ? "user" : record.leadSubmissionId ? "leadSubmission" : record.customerId ? "customer" : "anonymous";
  const subjectId = record.userId ?? record.leadSubmissionId ?? record.customerId ?? null;

  return {
    id: record.id,
    purposeKey: record.consentPurpose.key,
    status: record.status,
    subjectType,
    subjectId,
    legalDocumentVersionId: record.legalDocumentVersionId,
    policyVersionNumber: record.legalDocumentVersion?.version ?? null,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    source: record.source,
    acceptanceMethod: record.acceptanceMethod,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  };
}
