import { getPaymentOrderStatusLabel, isKnownPaymentOrderStatus } from "@asodef/payments";
import type { PaymentOrderStatus } from "@prisma/client";

export interface CreateBoldPaymentResponse {
  publicReference: string;
  orderStatus: string;
  orderStatusLabel: string;
  /**
   * Whatever the provider returned as the outcome of createPayment().
   * It remains opaque to the payment-order domain and is never trusted as
   * authority for amount, customer identity or legacy application.
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
  /** Present only on the external-obligation path; modern responses stay unchanged. */
  source?: "master";
  /** Provider settlement and legacy application are deliberately separate. */
  legacyApplicationStatus?: string;
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
