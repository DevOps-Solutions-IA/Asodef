import type { PqrCase } from "@prisma/client";

/** Public shape (submission response + reference-only lookup) - never
 * the internal id, never applicantName/applicantContact (only the
 * submitter themselves already knows those - re-echoing them back on a
 * reference-only lookup anyone with the case number could reach isn't
 * needed and is extra exposure), never relatedCustomerId. */
export interface PublicPqrCaseResponse {
  caseNumber: string;
  category: string;
  status: string;
  description: string;
  resolution: string | null;
  createdAt: Date;
}

export function toPublicPqrCaseResponse(pqrCase: PqrCase): PublicPqrCaseResponse {
  return {
    caseNumber: pqrCase.caseNumber,
    category: pqrCase.category,
    status: pqrCase.status,
    description: pqrCase.description,
    resolution: pqrCase.resolution,
    createdAt: pqrCase.createdAt,
  };
}

export interface AdminPqrCaseResponse {
  id: string;
  caseNumber: string;
  category: string;
  applicantName: string;
  applicantContact: string;
  relatedCustomerId: string | null;
  relatedPaymentOrderId: string | null;
  relatedContractId: string | null;
  description: string;
  assignedTeam: string | null;
  priority: string | null;
  dueDate: Date | null;
  status: string;
  resolution: string | null;
  satisfactionScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminPqrCaseResponse(pqrCase: PqrCase): AdminPqrCaseResponse {
  return {
    id: pqrCase.id,
    caseNumber: pqrCase.caseNumber,
    category: pqrCase.category,
    applicantName: pqrCase.applicantName,
    applicantContact: pqrCase.applicantContact,
    relatedCustomerId: pqrCase.relatedCustomerId,
    relatedPaymentOrderId: pqrCase.relatedPaymentOrderId,
    relatedContractId: pqrCase.relatedContractId,
    description: pqrCase.description,
    assignedTeam: pqrCase.assignedTeam,
    priority: pqrCase.priority,
    dueDate: pqrCase.dueDate,
    status: pqrCase.status,
    resolution: pqrCase.resolution,
    satisfactionScore: pqrCase.satisfactionScore,
    createdAt: pqrCase.createdAt,
    updatedAt: pqrCase.updatedAt,
  };
}

export interface AdminPqrCaseListResponse {
  items: AdminPqrCaseResponse[];
  total: number;
  page: number;
  pageSize: number;
}
