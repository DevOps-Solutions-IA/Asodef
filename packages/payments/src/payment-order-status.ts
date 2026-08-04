/**
 * US-023: "a single shared statusMap module maps the 10 internal
 * statuses to Spanish labels ... imported by both API responses and
 * (later) the frontend." Lives here (not in apps/api) specifically
 * because it must be importable from apps/web too - PaymentOrderStatus
 * mirrors apps/api's own Prisma enum (packages/payments has no
 * dependency on @prisma/client, so this stays importable from the
 * browser bundle as well).
 */
export const PAYMENT_ORDER_STATUSES = [
  "DRAFT",
  "PENDING",
  "PROCESSING",
  "APPROVED",
  "REJECTED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUSES)[number];

/** Exact Spanish labels from the acceptance criteria, verbatim:
 * "Borrador/Pendiente/Procesando/Aprobado/Rechazado/Fallido/Vencido/
 * Cancelado/Reembolsado/Reembolso parcial". */
export const PAYMENT_ORDER_STATUS_LABELS_ES: Record<PaymentOrderStatus, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  FAILED: "Fallido",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolso parcial",
};

export function isKnownPaymentOrderStatus(value: string): value is PaymentOrderStatus {
  return (PAYMENT_ORDER_STATUSES as readonly string[]).includes(value);
}

export function getPaymentOrderStatusLabel(status: PaymentOrderStatus): string {
  return PAYMENT_ORDER_STATUS_LABELS_ES[status];
}
