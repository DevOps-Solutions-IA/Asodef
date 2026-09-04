import { maskDocumentNumber } from "../payments-lookup/mask-document-number";
import type { VerifiedMasterPaymentSource } from "./master-payment-preflight.service";

export interface PublicMasterPaymentPreflightResponse {
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
    dueDate: Date;
    status: string;
  };
  onlinePaymentAvailable: false;
}

/** Never expose personId/contractId/installmentId outside the API boundary. */
export function toPublicMasterPaymentPreflightResponse(
  source: VerifiedMasterPaymentSource,
): PublicMasterPaymentPreflightResponse {
  return {
    source: "master",
    customer: {
      fullName: source.fullName,
      documentType: source.documentType,
      maskedDocumentNumber: maskDocumentNumber(source.document),
    },
    obligation: {
      concept: source.concept,
      amountCents: source.amountCents,
      currency: source.currency,
      dueDate: source.dueDate,
      status: source.status,
    },
    onlinePaymentAvailable: false,
  };
}
