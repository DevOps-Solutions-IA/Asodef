import { apiClient } from "../api-client";
import type {
  AdminPaymentEvent,
  AdminPaymentOrder,
  AdminPaymentOrderListResponse,
  AdminRefund,
  SearchPaymentOrdersFilters,
} from "./admin-payments-types";

function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function searchPaymentOrders(filters: SearchPaymentOrdersFilters, signal?: AbortSignal): Promise<AdminPaymentOrderListResponse> {
  return apiClient.get<AdminPaymentOrderListResponse>(`/admin/payment-orders/search${toQueryString(filters)}`, { signal });
}

export function getPaymentOrder(id: string, signal?: AbortSignal): Promise<AdminPaymentOrder> {
  return apiClient.get<AdminPaymentOrder>(`/admin/payment-orders/${id}`, { signal });
}

export function listPaymentEvents(orderId: string, signal?: AbortSignal): Promise<AdminPaymentEvent[]> {
  return apiClient.get<AdminPaymentEvent[]>(`/admin/payment-orders/${orderId}/events`, { signal });
}

export function listRefundsForOrder(paymentOrderId: string, signal?: AbortSignal): Promise<AdminRefund[]> {
  return apiClient.get<AdminRefund[]>(`/admin/refunds?paymentOrderId=${encodeURIComponent(paymentOrderId)}`, { signal });
}

export function requestRefund(publicReference: string, amountCents: number, reason: string): Promise<AdminRefund> {
  return apiClient.post<AdminRefund>(`/payments/${encodeURIComponent(publicReference)}/refund`, { amountCents, reason });
}

export function approveRefund(refundId: string): Promise<AdminRefund> {
  return apiClient.post<AdminRefund>(`/admin/refunds/${refundId}/approve`, {});
}
