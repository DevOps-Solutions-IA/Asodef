/**
 * Mirrors apps/api's payments-lookup.types.ts / payment-order.types.ts
 * response shapes exactly (field names verbatim) - kept in sync
 * manually, same convention as lib/auth/auth-types.ts.
 */
export interface LookupCustomer {
  fullName: string;
  documentType: string;
  maskedDocumentNumber: string;
}

export interface LookupObligation {
  obligationId: string;
  concept: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  status: string;
  source?: "modern" | "master";
  onlinePaymentAvailable?: boolean;
}

export interface MasterPaymentPreflightResponse {
  source: "master";
  customer: {
    fullName: string;
    documentType: string | null;
    maskedDocumentNumber: string;
  };
  obligation: {
    concept: string;
    amountCents: number;
    currency: "COP";
    dueDate: string;
    status: string;
  };
  onlinePaymentAvailable: false;
}

export interface PaymentOrderSummary {
  publicReference: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  expiresAt: string;
  obligation: { concept: string; dueDate: string };
}

export type PaymentsLookupResponse =
  | { type: "customer"; customer: LookupCustomer; obligations: LookupObligation[] }
  | { type: "order"; order: PaymentOrderSummary };

export interface PaymentsLookupByDocumentRequest {
  documentType: string;
  documentNumber: string;
}

export interface PaymentsLookupByReferenceRequest {
  reference: string;
}

export type PaymentsLookupRequest = PaymentsLookupByDocumentRequest | PaymentsLookupByReferenceRequest;

/** Mirrors apps/api's bold-payments.types.ts (US-025). */
export interface CreateBoldPaymentResult {
  publicReference: string;
  orderStatus: string;
  orderStatusLabel: string;
  /** Opaque provider payload (US-022/US-025's own "only `status` is
   * confirmed" contract) - never assume a specific shape here either. */
  providerNextAction: unknown;
}

export interface BoldPaymentStatus {
  publicReference: string;
  orderStatus: string;
  orderStatusLabel: string;
  attemptStatus: string | null;
}

/** Mirrors apps/api's payment-receipts.service.ts ReceiptDetail (US-027). */
export interface ReceiptDetail {
  publicReference: string;
  receiptNumber: string;
  verificationCode: string;
  issuedAt: string;
  customerFullName: string;
  maskedDocumentNumber: string;
  concept: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  dueDate: string;
}
