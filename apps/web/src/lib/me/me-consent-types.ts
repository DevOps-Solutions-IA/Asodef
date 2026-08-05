export interface MyConsentRecord {
  id: string;
  purposeKey: string;
  status: string;
  policyVersionNumber: number | null;
  source: string;
  acceptanceMethod: string;
  createdAt: string;
  revokedAt: string | null;
}

/** Mirrors the 8-key CONSENT_PURPOSE_CATALOG (apps/api/src/database/
 * consent-purpose-catalog.ts) - labels only, the catalog itself stays
 * backend-owned. */
export const CONSENT_PURPOSE_LABELS: Record<string, string> = {
  terms_and_conditions: "Términos y condiciones",
  data_processing: "Tratamiento de datos",
  commercial_communications: "Comunicaciones comerciales",
  electronic_notifications: "Notificaciones electrónicas",
  cookie_preferences: "Preferencias de cookies",
  payment_terms: "Términos de pago",
  contract_acceptance: "Aceptación de contrato",
  optional_marketing: "Marketing opcional",
};

export const CONSENT_STATUS_LABELS: Record<string, string> = {
  GRANTED: "Otorgado",
  DENIED: "Rechazado",
  REVOKED: "Revocado",
};
