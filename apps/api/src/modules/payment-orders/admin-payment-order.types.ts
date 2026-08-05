import { getPaymentOrderStatusLabel, isKnownPaymentOrderStatus } from "@asodef/payments";
import type { Customer, Obligation, PaymentOrder } from "@prisma/client";

/** US-063: admin-only shape - unlike the public PaymentOrderResponse,
 * this exposes the internal id (every admin action targets an order by
 * id) and the customer's real (unmasked) identity, since this is only
 * ever served to authenticated staff holding payments.read. */
export interface AdminPaymentOrderResponse {
  id: string;
  publicReference: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  createdAt: Date;
  expiresAt: Date;
  customer: {
    id: string;
    fullName: string;
    documentType: string;
    documentNumber: string;
  };
  obligation: {
    concept: string;
    dueDate: Date;
  };
}

type PaymentOrderWithCustomerAndObligation = PaymentOrder & {
  customer: Pick<Customer, "id" | "fullName" | "documentType" | "documentNumber">;
  obligation: Pick<Obligation, "concept" | "dueDate">;
};

export function toAdminPaymentOrderResponse(order: PaymentOrderWithCustomerAndObligation): AdminPaymentOrderResponse {
  const statusLabel = isKnownPaymentOrderStatus(order.status) ? getPaymentOrderStatusLabel(order.status) : order.status;

  return {
    id: order.id,
    publicReference: order.publicReference,
    amountCents: order.amountCents,
    currency: order.currency,
    status: order.status,
    statusLabel,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    customer: {
      id: order.customer.id,
      fullName: order.customer.fullName,
      documentType: order.customer.documentType,
      documentNumber: order.customer.documentNumber,
    },
    obligation: {
      concept: order.obligation.concept,
      dueDate: order.obligation.dueDate,
    },
  };
}

export interface AdminPaymentOrderListResponse {
  items: AdminPaymentOrderResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminPaymentEventResponse {
  id: string;
  source: string;
  eventType: string;
  payload: unknown;
  receivedAt: Date;
  processedAt: Date | null;
}
