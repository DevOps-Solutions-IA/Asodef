import type { Customer, Obligation } from "@prisma/client";
import { maskDocumentNumber } from "./mask-document-number";
import type { PaymentOrderResponse } from "../payment-orders/payment-order.types";

/** Public-safe: fullName + documentType + masked number only - "never
 * return full customer PII beyond what's needed to confirm identity"
 * (PRD rule). email/phone are deliberately never included here. */
export interface LookupCustomerResponse {
  fullName: string;
  documentType: string;
  maskedDocumentNumber: string;
}

/**
 * obligationId is an opaque selection identifier for the current payment
 * lookup result. Modern obligations use their v4 UUID. Master obligations
 * are explicitly marked as read-only until the confirmed-payment write
 * bridge is available, so their identifier is never accepted by the modern
 * POST /payment-orders path.
 */
export interface LookupObligationResponse {
  obligationId: string;
  concept: string;
  amountCents: number;
  currency: string;
  dueDate: Date;
  status: string;
  source: "modern" | "master";
  onlinePaymentAvailable: boolean;
}

export type PaymentsLookupResponse =
  | { type: "customer"; customer: LookupCustomerResponse; obligations: LookupObligationResponse[] }
  | { type: "order"; order: PaymentOrderResponse };

export function toLookupCustomerResponse(customer: Customer): LookupCustomerResponse {
  return {
    fullName: customer.fullName,
    documentType: customer.documentType,
    maskedDocumentNumber: maskDocumentNumber(customer.documentNumber),
  };
}

export function toLookupObligationResponse(obligation: Obligation): LookupObligationResponse {
  return {
    obligationId: obligation.id,
    concept: obligation.concept,
    amountCents: obligation.amountCents,
    currency: obligation.currency,
    dueDate: obligation.dueDate,
    status: obligation.status,
    source: "modern",
    onlinePaymentAvailable: true,
  };
}
