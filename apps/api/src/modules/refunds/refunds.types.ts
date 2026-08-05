import type { Refund } from "@prisma/client";

/** evidencePath is deliberately never exposed - internal filesystem
 * location only, same precedent as ContractVersion.documentPath. */
export interface AdminRefundResponse {
  id: string;
  paymentOrderId: string;
  amountCents: number;
  reason: string;
  hasEvidence: boolean;
  status: string;
  approvedByUserId: string | null;
  providerReference: string | null;
  createdAt: Date;
}

export function toAdminRefundResponse(refund: Refund): AdminRefundResponse {
  return {
    id: refund.id,
    paymentOrderId: refund.paymentOrderId,
    amountCents: refund.amountCents,
    reason: refund.reason,
    hasEvidence: refund.evidencePath != null,
    status: refund.status,
    approvedByUserId: refund.approvedByUserId,
    providerReference: refund.providerReference,
    createdAt: refund.createdAt,
  };
}
