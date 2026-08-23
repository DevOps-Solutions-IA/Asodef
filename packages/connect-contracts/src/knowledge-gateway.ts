import { GATEWAY_CONTEXT_SCHEMA } from "./shared";
import type {
  ConnectContractVersion,
  DataClassification,
  GatewayError,
  GatewayRequestContext,
  GatewayTimeout,
  JsonSchema,
} from "./shared";

export const KNOWLEDGE_STATUSES = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "RETIRED",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export interface KnowledgeLifecycleRecord {
  id: string;
  status: KnowledgeStatus;
  createdAt: string;
  createdBy: string;
}

export interface KnowledgeSource extends KnowledgeLifecycleRecord {
  version: "v1";
  name: string;
  sourceType: "MANAGED_UPLOAD" | "APPROVED_API" | "CURATED_CONTENT";
  dataClassification: DataClassification;
  permission: string;
  ingestionSchema: JsonSchema;
  audit: {
    event: "ai.knowledge.source.read";
    recordActor: true;
    recordResult: true;
  };
}

export interface KnowledgeDocument extends KnowledgeLifecycleRecord {
  version: "v1";
  sourceId: string;
  title: string;
  checksumSha256: string;
  dataClassification: DataClassification;
  metadata: Readonly<Record<string, string>>;
}

export interface KnowledgeVersion extends KnowledgeLifecycleRecord {
  version: number;
  documentId: string;
  checksumSha256: string;
  contentLocation: string;
  supersedesVersionId?: string;
  reviewEvidence?: string;
}

export interface KnowledgeCollection extends KnowledgeLifecycleRecord {
  version: number;
  name: string;
  purpose: string;
  knowledgeVersionIds: readonly string[];
  allowedModelProfileIds: readonly string[];
  maximumDataClassification: DataClassification;
}

export interface KnowledgePublication extends KnowledgeLifecycleRecord {
  version: number;
  collectionId: string;
  publishedKnowledgeVersionIds: readonly string[];
  approvedBy: string;
  approvedAt: string;
  retiredAt?: string;
  rollbackPublicationId?: string;
}

export interface KnowledgeGatewayRequest {
  version: ConnectContractVersion;
  query: string;
  collectionIds: readonly string[];
  limit: number;
  timeout?: GatewayTimeout;
}

export interface KnowledgeGatewayCitation {
  publicationId: string;
  knowledgeVersionId: string;
  documentId: string;
  title: string;
  excerpt: string;
  dataClassification: DataClassification;
}

export interface KnowledgeGatewayResponse {
  version: ConnectContractVersion;
  citations: readonly KnowledgeGatewayCitation[];
  correlationId: string;
}

export type KnowledgeGatewayErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONSENT_REQUIRED"
  | "DATA_CLASSIFICATION_DENIED"
  | "INVALID_REQUEST"
  | "KNOWLEDGE_NOT_PUBLISHED"
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

export const KNOWLEDGE_GATEWAY_CONTRACT = Object.freeze({
  version: "v1",
  contextSchema: GATEWAY_CONTEXT_SCHEMA,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["version", "query", "collectionIds", "limit"],
    properties: {
      version: { const: "v1" },
      query: { type: "string", minLength: 1, maxLength: 2_000 },
      collectionIds: { type: "array", minItems: 1, maxItems: 20 },
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
    "KNOWLEDGE_NOT_PUBLISHED",
    "RATE_LIMITED",
    "TIMEOUT",
    "UPSTREAM_ERROR",
  ] satisfies readonly KnowledgeGatewayErrorCode[],
  permissions: "EFFECTIVE_ACTOR_RBAC_COLLECTION_AND_PUBLICATION_POLICY",
  audit:
    "ACTOR_QUERY_DIGEST_COLLECTIONS_CITATIONS_RESULT_AND_CORRELATION;NO_RAW_PROMPT_BY_DEFAULT",
  idempotency: "READ_ONLY",
  publication: "KORAL_MAY_CONSUME_ONLY_PUBLISHED_KNOWLEDGE_PUBLICATIONS",
});
