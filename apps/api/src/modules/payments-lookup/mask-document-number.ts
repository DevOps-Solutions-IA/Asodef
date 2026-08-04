/**
 * PRD rule (verbatim): "Payment lookup responses mask customer
 * identification (e.g. show only last 4 digits)". Masks every
 * character except the last 4 with "•" - if the number has 4 or fewer
 * characters, masks all but the last 1 rather than revealing the whole
 * thing.
 */
export function maskDocumentNumber(documentNumber: string): string {
  const visibleCount = documentNumber.length > 4 ? 4 : Math.min(1, documentNumber.length);
  const visible = documentNumber.slice(-visibleCount);
  const maskedLength = documentNumber.length - visibleCount;
  return "•".repeat(maskedLength) + visible;
}
