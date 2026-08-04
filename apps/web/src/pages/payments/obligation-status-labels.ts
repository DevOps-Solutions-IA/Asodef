/** Direct Spanish translations of apps/api's ObligationStatus enum
 * (schema.prisma) - not a business claim, just a label map, same
 * pattern as packages/payments' PAYMENT_ORDER_STATUS_LABELS_ES. Kept
 * local to the web app (not shared) since only the payments-lookup UI
 * needs it today. */
export const OBLIGATION_STATUS_LABELS_ES: Record<string, string> = {
  PENDING: "Pendiente",
  OVERDUE: "Vencida",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

export function getObligationStatusLabel(status: string): string {
  return OBLIGATION_STATUS_LABELS_ES[status] ?? status;
}
