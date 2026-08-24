import { GATEWAY_CONTEXT_SCHEMA } from "./shared";
import type {
  ConnectContractVersion,
  DataClassification,
  GatewayError,
  GatewayRequestContext,
  GatewayTimeout,
} from "./shared";

export const KNOWLEDGE_STATUSES = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "RETIRED",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const KNOWLEDGE_DOMAINS = [
  "ASODEF_INSTITUCIONAL",
  "SERVICIOS_Y_PROTECCION",
  "AFILIACIONES",
  "PLANES_Y_COBERTURAS",
  "BENEFICIARIOS",
  "REQUISITOS",
  "BENEFICIOS_Y_CONVENIOS",
  "AUXILIOS_Y_PROTECCIONES",
  "SOLICITUD_DE_SERVICIO",
  "PAGOS_ORIENTACION",
  "PQR",
  "ACTUALIZACION_DE_DATOS",
  "CONTACTO_Y_CANALES",
  "PREGUNTAS_FRECUENTES",
] as const;
export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export const KNOWLEDGE_GROUNDING_OUTCOMES = [
  "SUFFICIENT_EVIDENCE",
  "PARTIAL_EVIDENCE",
  "NO_EVIDENCE",
  "SOURCE_CONFLICT",
] as const;
export type KnowledgeGroundingOutcome =
  (typeof KNOWLEDGE_GROUNDING_OUTCOMES)[number];

export const KNOWLEDGE_AUDIENCES = [
  "PUBLIC",
  "AUTHENTICATED_AFFILIATE",
  "INTERNAL",
  "ADMIN_ONLY",
] as const;
export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];

export interface KnowledgeLifecycleRecord {
  id: string;
  status: KnowledgeStatus;
  createdAt: string;
  createdBy: string;
}

/** Stable identity. Lifecycle is deliberately absent: publishing a version
 * never mutates the item globally. */
export interface KnowledgeItemContract {
  version: "v1";
  id: string;
  stableKey: string;
  tenantKey: "ASODEF";
  revision: number;
}

export interface KnowledgeVersionContract extends KnowledgeLifecycleRecord {
  version: number;
  knowledgeItemId: string;
  title: string;
  domain: KnowledgeDomain;
  audience: KnowledgeAudience;
  dataClassification: DataClassification;
  language: "es";
  effectiveFrom?: string;
  effectiveUntil?: string;
  requiresRevalidationAt?: string;
  revision: number;
  changeReason: string;
}

/** Source metadata belongs to exactly one version and has no publication
 * lifecycle of its own. */
export interface KnowledgeSourceContract {
  version: "v1";
  id: string;
  knowledgeVersionId: string;
  sourceType: "MANUAL_AUTHORING" | "FILE_UPLOAD" | "OFFICIAL_WEB_IMPORT";
  sourceReference: string;
  sourceOwner: string;
  sourceChecksumSha256: string;
}

export interface KnowledgeChunkContract {
  version: "v1";
  id: string;
  knowledgeVersionId: string;
  ordinal: number;
  checksumSha256: string;
  tokenEstimate: number;
}

/** Immutable publication evidence. It snapshots the exact source and chunk
 * set; it never promotes a shared source, item or collection. */
export interface KnowledgePublicationSnapshotContract {
  version: "v1";
  id: string;
  knowledgeItemId: string;
  knowledgeVersionId: string;
  knowledgeSourceId: string;
  sourceReference: string;
  sourceChecksumSha256: string;
  chunkSetChecksumSha256: string;
  audience: KnowledgeAudience;
  dataClassification: DataClassification;
  effectiveFrom?: string;
  effectiveUntil?: string;
  publishedBy: string;
  publishedAt: string;
}

export interface KnowledgeGatewayRequest {
  version: ConnectContractVersion;
  query: string;
  domainKeys: readonly KnowledgeDomain[];
  limit: number;
  timeout?: GatewayTimeout;
}

export interface KnowledgeGatewayCitation {
  publicationId: string;
  knowledgeItemId: string;
  knowledgeVersionId: string;
  knowledgeChunkId: string;
  knowledgeSourceId: string;
  title: string;
  excerpt: string;
  dataClassification: DataClassification;
  audience: KnowledgeAudience;
  language: "es";
  sourceReference: string;
  sourceChecksumSha256: string;
  score: number;
}

export interface KnowledgeGatewayResponse {
  version: ConnectContractVersion;
  outcome: KnowledgeGroundingOutcome;
  citations: readonly KnowledgeGatewayCitation[];
  correlationId: string;
}

export type KnowledgeGatewayErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONSENT_REQUIRED"
  | "DATA_CLASSIFICATION_DENIED"
  | "INVALID_REQUEST"
  | "LANGUAGE_UNSUPPORTED"
  | "KNOWLEDGE_NOT_PUBLISHED"
  | "TENANT_SCOPE_UNRESOLVED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_ERROR";

export type KnowledgeGatewayError = GatewayError<KnowledgeGatewayErrorCode>;

export type KnowledgeGatewayResult =
  | { ok: true; response: KnowledgeGatewayResponse }
  | { ok: false; error: KnowledgeGatewayError };

export interface KnowledgeGateway {
  search(
    request: KnowledgeGatewayRequest,
    context: GatewayRequestContext,
  ): Promise<KnowledgeGatewayResult>;
}

const KNOWLEDGE_GATEWAY_CONTEXT_SCHEMA = Object.freeze({
  ...GATEWAY_CONTEXT_SCHEMA,
  required: [...GATEWAY_CONTEXT_SCHEMA.required, "effectiveScope"],
});

export const KNOWLEDGE_GATEWAY_CONTRACT = Object.freeze({
  version: "v1",
  contextSchema: KNOWLEDGE_GATEWAY_CONTEXT_SCHEMA,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["version", "query", "domainKeys", "limit"],
    properties: {
      version: { const: "v1" },
      query: { type: "string", minLength: 1, maxLength: 2_000 },
      domainKeys: { type: "array", minItems: 1, maxItems: 14 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
      timeout: { type: "object" },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      response: { type: "object" },
      error: { type: "object" },
    },
  },
  errors: [
    "AUTHORIZATION_DENIED",
    "CONSENT_REQUIRED",
    "DATA_CLASSIFICATION_DENIED",
    "INVALID_REQUEST",
    "LANGUAGE_UNSUPPORTED",
    "KNOWLEDGE_NOT_PUBLISHED",
    "TENANT_SCOPE_UNRESOLVED",
    "RATE_LIMITED",
    "TIMEOUT",
    "UPSTREAM_ERROR",
  ] satisfies readonly KnowledgeGatewayErrorCode[],
  permissions: "EFFECTIVE_ACTOR_RBAC_AND_PUBLICATION_POLICY",
  audit:
    "ACTOR_QUERY_DIGEST_CITATIONS_RESULT_AND_CORRELATION;NO_RAW_PROMPT_BY_DEFAULT",
  idempotency: "READ_ONLY",
  publication: "KORAL_MAY_CONSUME_ONLY_PUBLISHED_KNOWLEDGE_PUBLICATIONS",
});
