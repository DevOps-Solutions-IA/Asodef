export const DSR_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibida",
  IDENTITY_VERIFICATION: "Verificación de identidad",
  IN_REVIEW: "En revisión",
  INFORMATION_REQUIRED: "Información requerida",
  RESOLVED: "Resuelta",
  REJECTED_WITH_REASON: "Rechazada",
  CLOSED: "Cerrada",
};

export const DSR_STATUSES = Object.keys(DSR_STATUS_LABELS);

export interface AdminDataSubjectRequest {
  id: string;
  publicReference: string;
  type: string;
  requesterName: string;
  requesterEmail: string;
  requesterDocument: string;
  identityVerificationStatus: string | null;
  description: string;
  assignedUserId: string | null;
  dueDate: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDataSubjectRequestListResponse {
  items: AdminDataSubjectRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListDataSubjectRequestsFilters {
  status?: string;
  page?: number;
  pageSize?: number;
}
