import { apiClient } from "../api-client";
import type { BoldPaymentStatus, CreateBoldPaymentResult, PaymentOrderSummary, PaymentsLookupRequest, PaymentsLookupResponse } from "./payments-types";

/** Public endpoints (US-023/US-024/US-025) - no auth cookie is required,
 * but apiClient always sends credentials:"include" regardless, which is
 * harmless for a @Public() route. */
export function lookupPayments(input: PaymentsLookupRequest): Promise<PaymentsLookupResponse> {
  return apiClient.post<PaymentsLookupResponse>("/payments/lookup", input);
}

export function createPaymentOrder(obligationId: string): Promise<PaymentOrderSummary> {
  return apiClient.post<PaymentOrderSummary>("/payment-orders", { obligationId });
}

export function getPaymentOrder(publicReference: string): Promise<PaymentOrderSummary> {
  return apiClient.get<PaymentOrderSummary>(`/payment-orders/${encodeURIComponent(publicReference)}`);
}

export function createBoldPayment(reference: string): Promise<CreateBoldPaymentResult> {
  return apiClient.post<CreateBoldPaymentResult>("/payments/bold/create", { reference });
}

export function getBoldPaymentStatus(reference: string): Promise<BoldPaymentStatus> {
  return apiClient.get<BoldPaymentStatus>(`/payments/${encodeURIComponent(reference)}/status`);
}
