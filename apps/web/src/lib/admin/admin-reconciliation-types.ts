export const RECONCILIATION_DIFFERENCE_KIND_LABELS: Record<string, string> = {
  PROVIDER_APPROVED_INTERNALLY_PENDING: "Aprobado por el proveedor, pendiente internamente",
  INTERNAL_APPROVED_NO_PROVIDER_CONFIRMATION: "Aprobado internamente sin confirmación del proveedor",
  DUPLICATE_EVENT: "Evento duplicado",
  AMOUNT_MISMATCH: "Diferencia de monto",
  REFERENCE_MISMATCH: "Diferencia de referencia",
  UNPROCESSED_NOTIFICATION: "Notificación sin procesar",
  REFUND_INCONSISTENCY: "Inconsistencia de reembolso",
};

export interface AdminReconciliationRun {
  id: string;
  runDate: string;
  rangeStart: string;
  rangeEnd: string;
  responsibleUserId: string;
  differencesFound: number;
  resolutionStatus: string;
  notes: string | null;
  createdAt: string;
}

export interface AdminReconciliationDifference {
  id: string;
  reconciliationId: string;
  paymentOrderId: string | null;
  kind: string;
  details: unknown;
  resolutionStatus: string;
  resolutionNotes: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
