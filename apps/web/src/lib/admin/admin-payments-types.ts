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

export interface AdminPaymentOrder {
  id: string;
  publicReference: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  expiresAt: string;
  customer: {
    id: string;
    fullName: string;
    documentType: string;
    documentNumber: string;
  };
  obligation: {
    concept: string;
    dueDate: string;
  };
}

export interface AdminPaymentOrderListResponse {
  items: AdminPaymentOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchPaymentOrdersFilters {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminPaymentEvent {
  id: string;
  source: string;
  eventType: string;
  payload: unknown;
  receivedAt: string;
  processedAt: string | null;
}

export interface AdminRefund {
  id: string;
  paymentOrderId: string;
  amountCents: number;
  reason: string;
  hasEvidence: boolean;
  status: string;
  approvedByUserId: string | null;
  providerReference: string | null;
  createdAt: string;
}

export const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  FAILED: "Fallido",
};
