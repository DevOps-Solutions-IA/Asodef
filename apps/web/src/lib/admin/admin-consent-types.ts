export interface AdminConsentRecord {
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
  createdAt: string;
  revokedAt: string | null;
}

export interface AdminConsentRecordListResponse {
  items: AdminConsentRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchConsentRecordsFilters {
  subjectType?: "user" | "leadSubmission" | "customer";
  subjectId?: string;
  purposeKey?: string;
  page?: number;
  pageSize?: number;
}
