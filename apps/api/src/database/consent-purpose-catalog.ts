/**
 * US-046: the literal 8 ConsentPurpose keys the AC gives, verbatim.
 * requiresPolicyVersion is true for the 4 purposes that correspond to
 * one of the 11 legal document types US-044 seeded (terms_and_conditions
 * -> terminos-y-condiciones, data_processing -> tratamiento-de-datos,
 * cookie_preferences -> politica-de-cookies, payment_terms ->
 * terminos-de-pago) - ConsentService.record() enforces this via the
 * story's own negative case ("without a resolvable policy version where
 * one is required"). The remaining 4 have no seeded legal document
 * counterpart today, so they don't require one; optional_marketing in
 * particular must never require a version - it's explicitly called out
 * in the AC as "kept fully separate and never bundled with essential
 * processing".
 */
export interface ConsentPurposeCatalogEntry {
  key: string;
  requiresPolicyVersion: boolean;
}

export const CONSENT_PURPOSE_CATALOG: readonly ConsentPurposeCatalogEntry[] = [
  { key: "terms_and_conditions", requiresPolicyVersion: true },
  { key: "data_processing", requiresPolicyVersion: true },
  { key: "commercial_communications", requiresPolicyVersion: false },
  { key: "electronic_notifications", requiresPolicyVersion: false },
  { key: "cookie_preferences", requiresPolicyVersion: true },
  { key: "payment_terms", requiresPolicyVersion: true },
  { key: "contract_acceptance", requiresPolicyVersion: false },
  { key: "optional_marketing", requiresPolicyVersion: false },
] as const;
