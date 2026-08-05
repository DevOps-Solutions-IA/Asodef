export interface LegalDocumentSection {
  heading: string;
  body: string;
}

/** Mirrors apps/api's PublicLegalDocumentResponse (US-043/US-045). */
export interface PublicLegalDocument {
  slug: string;
  type: string;
  title: string;
  version: number;
  content: { sections: LegalDocumentSection[] } | null;
  effectiveDate: string | null;
  publicationDate: string | null;
}
