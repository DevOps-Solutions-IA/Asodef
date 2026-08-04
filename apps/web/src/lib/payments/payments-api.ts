import { apiClient } from "../api-client";
import type { PaymentOrderSummary, PaymentsLookupRequest, PaymentsLookupResponse } from "./payments-types";

/** Public endpoints (US-023/US-024) - no auth cookie is required, but
 * apiClient always sends credentials:"include" regardless, which is
 * harmless for a @Public() route. */
export function lookupPayments(input: PaymentsLookupRequest): Promise<PaymentsLookupResponse> {
  return apiClient.post<PaymentsLookupResponse>("/payments/lookup", input);
}

export function createPaymentOrder(obligationId: string): Promise<PaymentOrderSummary> {
  return apiClient.post<PaymentOrderSummary>("/payment-orders", { obligationId });
}
