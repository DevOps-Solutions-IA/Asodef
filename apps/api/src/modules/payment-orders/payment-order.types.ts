import { getPaymentOrderStatusLabel, isKnownPaymentOrderStatus } from "@asodef/payments";
import type { PaymentOrderWithObligation } from "./payment-orders.service";

/** Public-safe shape: publicReference, never the internal id. Never
 * exposes obligationId/customerId either - the nested `obligation`
 * summary carries only what a customer needs to recognize what they're
 * paying for (concept, dueDate), not the Obligation's own internal id. */
export interface PaymentOrderResponse {
  publicReference: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  createdAt: Date;
  expiresAt: Date;
  obligation: {
    concept: string;
    dueDate: Date;
  };
}

export function toPaymentOrderResponse(order: PaymentOrderWithObligation): PaymentOrderResponse {
  const statusLabel = isKnownPaymentOrderStatus(order.status) ? getPaymentOrderStatusLabel(order.status) : order.status;

  return {
    publicReference: order.publicReference,
    amountCents: order.amountCents,
    currency: order.currency,
    status: order.status,
    statusLabel,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    obligation: {
      concept: order.obligation.concept,
      dueDate: order.obligation.dueDate,
    },
  };
}
