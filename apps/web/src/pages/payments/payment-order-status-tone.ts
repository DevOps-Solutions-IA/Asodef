import type { StatusTone } from "@asodef/ui";

/** Visual tone only - the actual Spanish label always comes from the
 * API's own statusLabel field (PAYMENT_ORDER_STATUS_LABELS_ES,
 * packages/payments), never recomputed here. */
const PAYMENT_ORDER_STATUS_TONES: Record<string, StatusTone> = {
  DRAFT: "draft",
  PENDING: "pending",
  PROCESSING: "processing",
  APPROVED: "success",
  REJECTED: "rejected",
  FAILED: "failed",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
};

export function getPaymentOrderStatusTone(status: string): StatusTone {
  return PAYMENT_ORDER_STATUS_TONES[status] ?? "pending";
}
