import { apiClient } from "../api-client";
import type { PublicLegalDocument } from "./legal-types";

/** Public endpoint (US-043) - only ever returns a PUBLISHED, currently
 * effective version; a 404 (caught by callers via ApiError.kind ===
 * "not_found") means "not yet published", not "does not exist". */
export function getPublicLegalDocument(slug: string): Promise<PublicLegalDocument> {
  return apiClient.get<PublicLegalDocument>(`/legal-documents/${encodeURIComponent(slug)}`);
}
