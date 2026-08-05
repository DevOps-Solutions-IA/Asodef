export const PQR_QUEUE_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido",
  ASSIGNED: "Asignado",
  IN_REVIEW: "En revisión",
  INFORMATION_REQUIRED: "Información requerida",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
  REOPENED: "Reabierto",
};

export const PQR_QUEUE_STATUSES = Object.keys(PQR_QUEUE_STATUS_LABELS);

export interface AdminPqrCase {
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
  dueDate: string | null;
  status: string;
  resolution: string | null;
  satisfactionScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPqrCaseListResponse {
  items: AdminPqrCase[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListPqrCasesFilters {
  status?: string;
  page?: number;
  pageSize?: number;
}
