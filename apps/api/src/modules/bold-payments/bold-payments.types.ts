import { getPaymentOrderStatusLabel, isKnownPaymentOrderStatus } from "@asodef/payments";
import type { PaymentOrderStatus } from "@prisma/client";

export interface CreateBoldPaymentResponse {
  publicReference: string;
  orderStatus: string;
  orderStatusLabel: string;
  /**
   * Whatever the provider returned as the outcome of createPayment()
   * (US-022's own CreatePaymentResult.raw) - the customer-facing next
   * step (e.g. a hosted-checkout redirect) in a real Bold integration.
   * Deliberately untyped/opaque for the modern provider path. The Master
   * hosted-link adapter narrows this to a safe checkout redirect object.
   */
  providerNextAction: unknown;
}

export interface BoldPaymentStatusResponse {
  publicReference: string;
  orderStatus: string;
  orderStatusLabel: string;
  attemptStatus: string | null;
  /** False for Master-originated payments until a public receipt contract is approved. */
  receiptAvailable?: boolean;
}

function toStatusLabel(status: PaymentOrderStatus | string): string {
  return isKnownPaymentOrderStatus(status) ? getPaymentOrderStatusLabel(status) : status;
}

export function toCreateBoldPaymentResponse(
  publicReference: string,
  orderStatus: PaymentOrderStatus,
  providerNextAction: unknown,
): CreateBoldPaymentResponse {
  return {
    publicReference,
    orderStatus,
    orderStatusLabel: toStatusLabel(orderStatus),
    providerNextAction,
  };
}

export function toBoldPaymentStatusResponse(
  publicReference: string,
  orderStatus: PaymentOrderStatus,
  attemptStatus: string | null,
): BoldPaymentStatusResponse {
  return {
    publicReference,
    orderStatus,
    orderStatusLabel: toStatusLabel(orderStatus),
    attemptStatus,
    receiptAvailable: true,
  };
}
