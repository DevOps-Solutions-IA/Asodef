import type { LegalDocumentVersion } from "@prisma/client";

/** Public shape (US-045 will consume this) - never exposes internal
 * database ids for either the document or the version; `slug` is
 * already the document's own safe public identifier. */
export interface PublicLegalDocumentResponse {
  slug: string;
  type: string;
  title: string;
  version: number;
  content: unknown;
  effectiveDate: Date | null;
  publicationDate: Date | null;
}

export function toPublicLegalDocumentResponse(
  slug: string,
  type: string,
  title: string,
  version: LegalDocumentVersion,
): PublicLegalDocumentResponse {
  return {
    slug,
    type,
    title,
    version: version.version,
    content: version.approvedContent,
    effectiveDate: version.effectiveDate,
    publicationDate: version.publicationDate,
  };
}

/** Admin/workflow shape - exposes workflow metadata (status, approver,
 * dates) but still never a raw internal id beyond what the admin UI
 * itself needs to act on (versionId is required here since every
 * workflow action targets a specific version by id - there is no
 * public-reference equivalent for a version the way PaymentOrder has
 * publicReference, since versions are never addressed by anyone but
 * authenticated legal/content staff). */
export interface AdminLegalDocumentVersionResponse {
  id: string;
  version: number;
  status: string;
  draftContent: unknown;
  approvedContent: unknown;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  changeSummary: string | null;
  approvedByUserId: string | null;
  approvalDate: Date | null;
  publicationDate: Date | null;
  createdAt: Date;
}

export function toAdminVersionResponse(version: LegalDocumentVersion): AdminLegalDocumentVersionResponse {
  return {
    id: version.id,
    version: version.version,
    status: version.status,
    draftContent: version.draftContent,
    approvedContent: version.approvedContent,
    effectiveDate: version.effectiveDate,
    expirationDate: version.expirationDate,
    changeSummary: version.changeSummary,
    approvedByUserId: version.approvedByUserId,
    approvalDate: version.approvalDate,
    publicationDate: version.publicationDate,
    createdAt: version.createdAt,
  };
}

export interface AdminLegalDocumentResponse {
  id: string;
  type: string;
  title: string;
  slug: string;
  currentVersionId: string | null;
  createdAt: Date;
  versions: AdminLegalDocumentVersionResponse[];
}
