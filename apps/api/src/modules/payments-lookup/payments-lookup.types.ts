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
 * obligationId is the internal Obligation uuid - exposed deliberately.
 * Unlike PaymentOrder, Obligation has no dedicated public-reference
 * field in the PRD's own dataModel, and the frontend needs *something*
 * to pass back to POST /payment-orders (which literally takes
 * `obligationId`, per US-023's own signature). A v4 uuid is still
 * cryptographically random/non-sequential, so this doesn't violate the
 * "never expose a guessable sequence" rule - it's conditioned on
 * exposing a *sequential* id, which this isn't.
 */
export interface LookupObligationResponse {
  obligationId: string;
  concept: string;
  amountCents: number;
  currency: string;
  dueDate: Date;
  status: string;
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
  };
}
