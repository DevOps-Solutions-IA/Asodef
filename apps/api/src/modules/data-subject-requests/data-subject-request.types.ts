import type { DataSubjectRequest } from "@prisma/client";

/** Public shape (submission response + reference-only lookup) - never
 * the internal id, never assignedUserId, never other requesters' data
 * (looked up strictly by the unguessable publicReference). */
export interface PublicDataSubjectRequestResponse {
  publicReference: string;
  type: string;
  status: string;
  description: string;
  resolution: string | null;
  createdAt: Date;
}

export function toPublicDataSubjectRequestResponse(request: DataSubjectRequest): PublicDataSubjectRequestResponse {
  return {
    publicReference: request.publicReference,
    type: request.type,
    status: request.status,
    description: request.description,
    resolution: request.resolution,
    createdAt: request.createdAt,
  };
}

/** Admin shape - the internal id is required here since every admin
 * action (assign/transition) targets a specific request by id, same
 * precedent as AdminLegalDocumentVersionResponse (US-043). */
export interface AdminDataSubjectRequestResponse {
  id: string;
  publicReference: string;
  type: string;
  requesterName: string;
  requesterEmail: string;
  requesterDocument: string;
  identityVerificationStatus: string | null;
  description: string;
  assignedUserId: string | null;
  dueDate: Date | null;
  status: string;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminDataSubjectRequestResponse(request: DataSubjectRequest): AdminDataSubjectRequestResponse {
  return {
    id: request.id,
    publicReference: request.publicReference,
    type: request.type,
    requesterName: request.requesterName,
    requesterEmail: request.requesterEmail,
    requesterDocument: request.requesterDocument,
    identityVerificationStatus: request.identityVerificationStatus,
    description: request.description,
    assignedUserId: request.assignedUserId,
    dueDate: request.dueDate,
    status: request.status,
    resolution: request.resolution,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export interface AdminDataSubjectRequestListResponse {
  items: AdminDataSubjectRequestResponse[];
  total: number;
  page: number;
  pageSize: number;
}
