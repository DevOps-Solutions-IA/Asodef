import type { ApprovalGate } from "@prisma/client";

export interface AdminApprovalGateResponse {
  id: string;
  key: string;
  description: string;
  status: string;
  approvedByUserId: string | null;
  approvalDate: Date | null;
  supportingDocumentPath: string | null;
  notes: string | null;
  expirationDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminApprovalGateResponse(gate: ApprovalGate): AdminApprovalGateResponse {
  return {
    id: gate.id,
    key: gate.key,
    description: gate.description,
    status: gate.status,
    approvedByUserId: gate.approvedByUserId,
    approvalDate: gate.approvalDate,
    supportingDocumentPath: gate.supportingDocumentPath,
    notes: gate.notes,
    expirationDate: gate.expirationDate,
    createdAt: gate.createdAt,
    updatedAt: gate.updatedAt,
  };
}
