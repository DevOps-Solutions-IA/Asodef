export const DATA_SUBJECT_REQUEST_TYPES = [
  "ACCESS",
  "CONSULTATION",
  "UPDATE",
  "CORRECTION",
  "DELETION",
  "REVOCATION",
  "PROOF_OF_AUTHORIZATION",
  "DATA_USE_INFORMATION",
  "COMPLAINT",
  "IDENTITY_VERIFICATION",
  "INCIDENT_REPORT",
] as const;

export type DataSubjectRequestType = (typeof DATA_SUBJECT_REQUEST_TYPES)[number];

export const DATA_SUBJECT_REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  ACCESS: "Acceso a mis datos",
  CONSULTATION: "Consulta",
  UPDATE: "Actualización",
  CORRECTION: "Corrección",
  DELETION: "Eliminación",
  REVOCATION: "Revocatoria de autorización",
  PROOF_OF_AUTHORIZATION: "Prueba de autorización",
  DATA_USE_INFORMATION: "Información sobre uso de datos",
  COMPLAINT: "Queja",
  IDENTITY_VERIFICATION: "Verificación de identidad",
  INCIDENT_REPORT: "Reporte de incidente",
};

export const DATA_SUBJECT_REQUEST_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibida",
  IDENTITY_VERIFICATION: "En verificación de identidad",
  IN_REVIEW: "En revisión",
  INFORMATION_REQUIRED: "Información requerida",
  RESOLVED: "Resuelta",
  REJECTED_WITH_REASON: "Rechazada",
  CLOSED: "Cerrada",
};

export interface CreateDataSubjectRequestPayload {
  type: DataSubjectRequestType;
  requesterName: string;
  requesterEmail: string;
  requesterDocument: string;
  description: string;
}

export interface PublicDataSubjectRequest {
  publicReference: string;
  type: string;
  status: string;
  description: string;
  resolution: string | null;
  createdAt: string;
}
