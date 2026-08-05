export const LEGAL_VERSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  LEGAL_REVIEW: "Revisión legal",
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  REPLACED: "Reemplazado",
  ARCHIVED: "Archivado",
};

export interface AdminLegalDocumentSummary {
  id: string;
  type: string;
  title: string;
  slug: string;
  currentVersionId: string | null;
  latestVersionStatus: string | null;
  latestVersionNumber: number | null;
  createdAt: string;
}

export interface AdminLegalDocumentVersion {
  id: string;
  version: number;
  status: string;
  draftContent: unknown;
  approvedContent: unknown;
  effectiveDate: string | null;
  expirationDate: string | null;
  changeSummary: string | null;
  approvedByUserId: string | null;
  approvalDate: string | null;
  publicationDate: string | null;
  createdAt: string;
}

export interface AdminLegalDocument {
  id: string;
  type: string;
  title: string;
  slug: string;
  currentVersionId: string | null;
  createdAt: string;
  versions: AdminLegalDocumentVersion[];
}
