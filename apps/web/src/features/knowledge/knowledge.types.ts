export type KnowledgeStatus = "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED";
export type KnowledgeAudience = "PUBLIC" | "AUTHENTICATED_AFFILIATE" | "INTERNAL" | "ADMIN_ONLY";
export type DataClassification = "PUBLIC" | "INTERNAL" | "PERSONAL" | "SENSITIVE" | "HIGHLY_SENSITIVE";
export type KnowledgeDomain =
  | "ASODEF_INSTITUCIONAL" | "SERVICIOS_Y_PROTECCION" | "AFILIACIONES"
  | "PLANES_Y_COBERTURAS" | "BENEFICIARIOS" | "REQUISITOS"
  | "BENEFICIOS_Y_CONVENIOS" | "AUXILIOS_Y_PROTECCIONES" | "SOLICITUD_DE_SERVICIO"
  | "PAGOS_ORIENTACION" | "PQR" | "ACTUALIZACION_DE_DATOS"
  | "CONTACTO_Y_CANALES" | "PREGUNTAS_FRECUENTES";

export interface KnowledgeSource { id: string; sourceType: "MANUAL_AUTHORING" | "FILE_UPLOAD" | "OFFICIAL_WEB_IMPORT"; sourceReference: string; sourceOwner: string; sourceChecksum: string; originalFileName: string | null; mimeType: string | null }
export interface KnowledgeAuditEvent { id: string; action: string; previousStatus: KnowledgeStatus | null; nextStatus: KnowledgeStatus | null; changeReason: string | null; createdAt: string; actorUserId: string | null }
export interface KnowledgeVersion { id: string; knowledgeItemId: string; version: number; revision: number; title: string; domain: KnowledgeDomain; audience: KnowledgeAudience; classification: DataClassification; language: string; content?: string; status: KnowledgeStatus; effectiveFrom: string | null; effectiveUntil: string | null; requiresRevalidationAt: string | null; changeReason: string; createdAt: string; updatedAt: string; publishedAt: string | null; retiredAt: string | null; source: KnowledgeSource | null; publicationSnapshot: { id: string; publishedAt: string; sourceChecksum: string; chunkSetChecksum: string } | null; auditEvents?: KnowledgeAuditEvent[] }
export interface KnowledgeItem { id: string; stableKey: string; tenantKey: "ASODEF"; revision: number; createdAt: string; updatedAt: string; versions: KnowledgeVersion[] }
export interface KnowledgeListResponse { items: KnowledgeItem[]; total: number; page: number; pageSize: number }
export interface KnowledgeFilters { search?: string; domain?: KnowledgeDomain; audience?: KnowledgeAudience; classification?: DataClassification; page: number; pageSize: number }
export interface DraftInput { stableKey?: string; knowledgeItemId?: string; expectedItemRevision?: number; title: string; domain: KnowledgeDomain; audience: KnowledgeAudience; classification: DataClassification; language: "es"; sourceReference: string; sourceOwner: string; effectiveFrom?: string; effectiveUntil?: string; requiresRevalidationAt?: string; changeReason: string; content?: string }
export interface KnowledgeDiff { knowledgeItemId: string; current: { id: string; version: number; title: string; content: string; sourceChecksum: string | null }; previous: { id: string; version: number; title: string; content: string; sourceChecksum: string | null } | null }
export interface KnowledgeRetrievalResult { ok: boolean; response?: { outcome: "SUFFICIENT_EVIDENCE" | "PARTIAL_EVIDENCE" | "NO_EVIDENCE" | "SOURCE_CONFLICT"; citations: Array<{ publicationId: string; knowledgeVersionId: string; title: string; excerpt: string; sourceReference: string; score: number }>; correlationId: string }; error?: { code: string; message: string; correlationId: string } }
