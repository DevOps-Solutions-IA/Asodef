/**
 * The 4 base P/Q/R/S categories are confirmed (the PRD's own literal
 * "P/Q/R/S + incident types"); the backend never enforces a closed
 * enum for category (see PqrCase.category's own schema comment), so
 * this list is offered as the common suggested set, not a hard
 * constraint - matching the backend's own "+ incident types" openness.
 */
export const PQR_BASE_CATEGORIES = ["peticion", "queja", "reclamo", "sugerencia"] as const;

export const PQR_CATEGORY_LABELS: Record<string, string> = {
  peticion: "Petición",
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
};

export const PQR_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido",
  ASSIGNED: "Asignado",
  IN_REVIEW: "En revisión",
  INFORMATION_REQUIRED: "Información requerida",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
  REOPENED: "Reabierto",
};

export interface CreatePqrCasePayload {
  category: string;
  applicantName: string;
  applicantContact: string;
  description: string;
  paymentReference?: string;
}

export interface PublicPqrCase {
  caseNumber: string;
  category: string;
  status: string;
  description: string;
  resolution: string | null;
  createdAt: string;
}
