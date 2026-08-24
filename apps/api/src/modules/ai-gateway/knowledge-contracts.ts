import type {
  DataClassification,
  GatewayRequestContext,
  KnowledgeAudience,
  KnowledgeItemContract,
  KnowledgePublicationSnapshotContract,
  KnowledgeStatus,
  KnowledgeVersionContract,
} from "@asodef/connect-contracts";

export {
  KNOWLEDGE_GATEWAY_CONTRACT,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_GROUNDING_OUTCOMES,
  KNOWLEDGE_STATUSES,
  type KnowledgeChunkContract,
  type KnowledgeDomain,
  type KnowledgeGateway,
  type KnowledgeGatewayCitation,
  type KnowledgeGatewayError,
  type KnowledgeGatewayErrorCode,
  type KnowledgeGatewayRequest,
  type KnowledgeGatewayResponse,
  type KnowledgeGatewayResult,
  type KnowledgeGroundingOutcome,
  type KnowledgeItemContract,
  type KnowledgeAudience,
  type KnowledgeLifecycleRecord,
  type KnowledgePublicationSnapshotContract,
  type KnowledgeSourceContract,
  type KnowledgeStatus,
  type KnowledgeVersionContract,
} from "@asodef/connect-contracts";

const ALLOWED_TRANSITIONS: Readonly<
  Record<KnowledgeStatus, readonly KnowledgeStatus[]>
> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["PUBLISHED", "RETIRED"],
  PUBLISHED: ["RETIRED"],
  RETIRED: [],
};

const CLASSIFICATION_RANK: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PERSONAL: 2,
  SENSITIVE: 3,
  HIGHLY_SENSITIVE: 4,
};

const ALLOWED_CONTENT_AUDIENCES: Readonly<
  Record<KnowledgeAudience, readonly KnowledgeAudience[]>
> = {
  PUBLIC: ["PUBLIC", "AUTHENTICATED_AFFILIATE", "INTERNAL", "ADMIN_ONLY"],
  AUTHENTICATED_AFFILIATE: ["AUTHENTICATED_AFFILIATE", "ADMIN_ONLY"],
  INTERNAL: ["INTERNAL", "ADMIN_ONLY"],
  ADMIN_ONLY: ["ADMIN_ONLY"],
};

export class KnowledgePublicationPolicy {
  assertTransition(current: KnowledgeStatus, next: KnowledgeStatus): void {
    if (!ALLOWED_TRANSITIONS[current].includes(next))
      throw new Error(`INVALID_KNOWLEDGE_TRANSITION:${current}:${next}`);
  }

  /** Pure fail-closed boundary. Scope authority must already have been
   * resolved by trusted server-side identity and membership services. */
  assertKoralReadable(
    item: KnowledgeItemContract,
    version: KnowledgeVersionContract,
    snapshot: KnowledgePublicationSnapshotContract,
    context: GatewayRequestContext,
    currentTime: Date,
  ): void {
    const scope = context.effectiveScope;
    if (!scope || scope.authority !== "SERVER_SIDE")
      deny("KNOWLEDGE_SERVER_SCOPE_REQUIRED");
    if (scope.tenantKey !== "ASODEF" || item.tenantKey !== scope.tenantKey)
      deny("KNOWLEDGE_TENANT_DENIED");
    if (!context.identity.permissions.includes("knowledge.read"))
      deny("KNOWLEDGE_READ_DENIED");

    if (!Array.isArray(scope.organizationIds) || scope.organizationIds.length)
      deny("KNOWLEDGE_ORGANIZATION_SCOPE_UNSUPPORTED");

    if (version.knowledgeItemId !== item.id)
      deny("KNOWLEDGE_ITEM_VERSION_MISMATCH");
    if (
      snapshot.knowledgeVersionId !== version.id ||
      snapshot.knowledgeItemId !== item.id
    )
      deny("KNOWLEDGE_PUBLICATION_BINDING_MISMATCH");
    if (version.status !== "PUBLISHED") deny("KNOWLEDGE_NOT_PUBLISHED");

    if (
      snapshot.audience !== version.audience ||
      snapshot.dataClassification !== version.dataClassification ||
      normalizeDate(snapshot.effectiveFrom) !==
        normalizeDate(version.effectiveFrom) ||
      normalizeDate(snapshot.effectiveUntil) !==
        normalizeDate(version.effectiveUntil)
    )
      deny("KNOWLEDGE_PUBLICATION_INCONSISTENT");

    if (!(scope.audience in ALLOWED_CONTENT_AUDIENCES))
      deny("KNOWLEDGE_AUDIENCE_DENIED");
    const allowedAudiences = ALLOWED_CONTENT_AUDIENCES[version.audience];
    if (!allowedAudiences?.includes(scope.audience as KnowledgeAudience))
      deny("KNOWLEDGE_AUDIENCE_DENIED");
    if (version.dataClassification === "HIGHLY_SENSITIVE")
      deny("KNOWLEDGE_CLASSIFICATION_DENIED");
    const contentRank = CLASSIFICATION_RANK[version.dataClassification];
    const scopeRank = CLASSIFICATION_RANK[scope.maximumDataClassification];
    const requestRank = CLASSIFICATION_RANK[context.policy.dataClassification];
    if (
      contentRank === undefined ||
      scopeRank === undefined ||
      requestRank === undefined ||
      contentRank > scopeRank ||
      contentRank > requestRank
    )
      deny("KNOWLEDGE_CLASSIFICATION_DENIED");
    if (version.language !== "es") deny("KNOWLEDGE_LANGUAGE_UNSUPPORTED");

    const now = currentTime.getTime();
    if (!Number.isFinite(now)) deny("KNOWLEDGE_CURRENT_TIME_INVALID");
    const effectiveFrom = parseOptionalDate(version.effectiveFrom);
    const effectiveUntil = parseOptionalDate(version.effectiveUntil);
    const publishedAt = Date.parse(snapshot.publishedAt);
    if (
      effectiveFrom === "INVALID" ||
      effectiveUntil === "INVALID" ||
      !Number.isFinite(publishedAt)
    )
      deny("KNOWLEDGE_DATE_INVALID");
    if (publishedAt > now) deny("KNOWLEDGE_PUBLICATION_NOT_EFFECTIVE");
    if (effectiveFrom !== null && effectiveFrom > now)
      deny("KNOWLEDGE_PUBLICATION_NOT_EFFECTIVE");
    if (effectiveUntil !== null && effectiveUntil <= now)
      deny("KNOWLEDGE_PUBLICATION_EXPIRED");
  }
}

function normalizeDate(value: string | undefined): string | null | "INVALID" {
  if (value === undefined) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "INVALID";
}

function parseOptionalDate(
  value: string | undefined,
): number | null | "INVALID" {
  if (value === undefined) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : "INVALID";
}

function deny(code: string): never {
  throw new Error(code);
}
