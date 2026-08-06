/** Mirrors apps/api's CreateLeadDto exactly (US-017) - field names are
 * the real API contract, not just display labels. */
export interface CreateLeadRequest {
  nombreCompleto: string;
  empresa: string;
  cargo: string;
  ciudad: string;
  telefono: string;
  correo: string;
  sector: string;
  mensaje: string;
  consentAccepted: true;
  commercialConsentAccepted?: boolean;
  /** Honeypot - always empty for a real visitor, never rendered as a
   * labeled field. */
  website?: string;
}

/** Mirrors apps/api's LeadSubmissionResponse exactly (US-017). */
export interface LeadSubmissionResponse {
  nombreCompleto: string;
  empresa: string;
  cargo: string;
  ciudad: string;
  telefono: string;
  correo: string;
  sector: string;
  mensaje: string;
  consentAccepted: boolean;
  createdAt: string;
}
