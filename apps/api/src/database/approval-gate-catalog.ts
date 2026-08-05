/**
 * US-058: the AC's own literal list of gate names, in the exact order
 * given (comma-separated in the story's own acceptanceCriteria text).
 * The AC's prose calls this "15 required gates" but the enumerated
 * list itself has 16 items - a PRD numbering inconsistency (same
 * category as US-044's "10 vs 11" doc types, US-053's "6 vs 7"
 * checks). Per this session's established precedent, the literal
 * enumerated list is the testable instruction - all 16 are seeded,
 * never silently trimmed to match the prose count.
 */
export interface ApprovalGateCatalogEntry {
  key: string;
  description: string;
}

export const APPROVAL_GATE_CATALOG: readonly ApprovalGateCatalogEntry[] = [
  { key: "nit", description: "NIT (identificación tributaria) confirmado" },
  { key: "legal_address", description: "Domicilio legal confirmado" },
  { key: "corporate_email", description: "Correo electrónico corporativo confirmado" },
  { key: "legal_representative", description: "Representante legal confirmado" },
  { key: "commercial_registration", description: "Registro mercantil confirmado" },
  { key: "privacy_policy", description: "Política de privacidad aprobada" },
  { key: "data_processing_policy", description: "Política de tratamiento de datos aprobada" },
  { key: "terms_and_conditions", description: "Términos y condiciones aprobados" },
  { key: "payment_policy", description: "Política de pagos aprobada" },
  { key: "refund_reversal_procedure", description: "Procedimiento de reembolsos y reversiones aprobado" },
  { key: "pqr_process", description: "Proceso de PQR aprobado" },
  { key: "plan_service_conditions", description: "Condiciones de planes y servicios aprobadas" },
  { key: "bold_production_credentials", description: "Credenciales de producción de Bold configuradas" },
  { key: "https", description: "HTTPS habilitado en producción" },
  { key: "webhook_validation", description: "Validación de webhooks confirmada" },
  { key: "customer_service_ownership", description: "Responsable de atención al cliente asignado" },
] as const;
