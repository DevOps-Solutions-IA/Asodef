import {
  DATA_CLASSIFICATIONS as KNOWLEDGE_DATA_CLASSIFICATIONS,
  KNOWLEDGE_AUDIENCES,
  type DataClassification,
  type KnowledgeAudience,
} from "@asodef/connect-contracts";

export const KNOWLEDGE_TENANT = "ASODEF" as const;
export type { KnowledgeAudience } from "@asodef/connect-contracts";
export type KnowledgeDataClassification = DataClassification;

export type KnowledgeAccessAuthority = "SERVER_SIDE";

export interface ServerDerivedKnowledgeScope {
  readonly source: unknown;
  readonly tenant: unknown;
  readonly audience: unknown;
  readonly dataClassification: unknown;
  readonly organizationIds?: unknown;
  readonly affiliateId?: unknown;
}

/**
 * This boundary deliberately accepts unknown values. Callers may receive
 * malformed or attacker-controlled objects even when their TypeScript types
 * claim otherwise, so authorization must fail closed at runtime.
 */
export interface KnowledgeAccessScopeInput {
  readonly authority: unknown;
  readonly serverDerivedScope?: ServerDerivedKnowledgeScope | null;
}

export interface ResolvedKnowledgeAccessScope {
  readonly authority: KnowledgeAccessAuthority;
  readonly tenant: typeof KNOWLEDGE_TENANT;
  readonly audience: KnowledgeAudience;
  readonly dataClassification: KnowledgeDataClassification;
  readonly affiliateId?: string;
}

export type KnowledgeAccessScopeErrorCode =
  | "UNTRUSTED_AUTHORITY"
  | "SCOPE_REQUIRED"
  | "UNTRUSTED_SCOPE_SOURCE"
  | "TENANT_DENIED"
  | "AUDIENCE_DENIED"
  | "CLASSIFICATION_DENIED"
  | "SUBJECT_SCOPE_INVALID";

export type KnowledgeAccessScopeResolution =
  | { readonly ok: true; readonly scope: ResolvedKnowledgeAccessScope }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: KnowledgeAccessScopeErrorCode;
        readonly message: string;
      };
    };

const CLASSIFICATION_RANK: Readonly<
  Record<KnowledgeDataClassification, number>
> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PERSONAL: 2,
  SENSITIVE: 3,
  HIGHLY_SENSITIVE: 4,
};

const AUDIENCE_MAX_CLASSIFICATION: Readonly<
  Record<KnowledgeAudience, KnowledgeDataClassification>
> = {
  PUBLIC: "PUBLIC",
  AUTHENTICATED_AFFILIATE: "PERSONAL",
  INTERNAL: "SENSITIVE",
  ADMIN_ONLY: "HIGHLY_SENSITIVE",
};

function deny(
  code: KnowledgeAccessScopeErrorCode,
  message: string,
): KnowledgeAccessScopeResolution {
  return { ok: false, error: { code, message } };
}

function isAudience(value: unknown): value is KnowledgeAudience {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_AUDIENCES as readonly string[]).includes(value)
  );
}

function isClassification(
  value: unknown,
): value is KnowledgeDataClassification {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_DATA_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}

function boundedIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 100
    ? normalized
    : undefined;
}

/**
 * Resolves the only scope Knowledge persistence/retrieval code may trust.
 * Client, prompt and tool payloads are data, never tenant authority.
 */
export function resolveKnowledgeAccessScope(
  input: KnowledgeAccessScopeInput,
): KnowledgeAccessScopeResolution {
  if (input.authority !== "SERVER_SIDE") {
    return deny(
      "UNTRUSTED_AUTHORITY",
      "Knowledge authority must be server-derived.",
    );
  }

  const candidate = input.serverDerivedScope;
  if (!candidate) {
    return deny(
      "SCOPE_REQUIRED",
      "A server-derived knowledge scope is required.",
    );
  }
  if (candidate.source !== "SERVER_SIDE") {
    return deny(
      "UNTRUSTED_SCOPE_SOURCE",
      "Knowledge scope source is not trusted.",
    );
  }
  if (candidate.tenant !== KNOWLEDGE_TENANT) {
    return deny(
      "TENANT_DENIED",
      "Knowledge tenant is outside the ASODEF boundary.",
    );
  }
  if (!isAudience(candidate.audience)) {
    return deny("AUDIENCE_DENIED", "Knowledge audience is not recognized.");
  }
  if (!isClassification(candidate.dataClassification)) {
    return deny(
      "CLASSIFICATION_DENIED",
      "Knowledge classification is not recognized.",
    );
  }

  const maximum = AUDIENCE_MAX_CLASSIFICATION[candidate.audience];
  if (
    CLASSIFICATION_RANK[candidate.dataClassification] >
    CLASSIFICATION_RANK[maximum]
  ) {
    return deny(
      "CLASSIFICATION_DENIED",
      "Knowledge classification exceeds the audience clearance.",
    );
  }

  const affiliateId = boundedIdentifier(candidate.affiliateId);
  const hasOrganizationClaim = candidate.organizationIds !== undefined;
  const hasAffiliateClaim = candidate.affiliateId !== undefined;

  if (
    (hasOrganizationClaim &&
      (!Array.isArray(candidate.organizationIds) ||
        candidate.organizationIds.length !== 0)) ||
    (hasAffiliateClaim && !affiliateId)
  ) {
    return deny(
      "SUBJECT_SCOPE_INVALID",
      "Knowledge subject scope is malformed.",
    );
  }

  if (
    candidate.audience === "AUTHENTICATED_AFFILIATE" &&
    !affiliateId
  ) {
    return deny(
      "SUBJECT_SCOPE_INVALID",
      "Affiliate knowledge requires exactly one server-derived affiliate scope.",
    );
  }

  if (
    (candidate.audience === "PUBLIC" ||
      candidate.audience === "INTERNAL" ||
      candidate.audience === "ADMIN_ONLY") &&
    affiliateId
  ) {
    return deny(
      "SUBJECT_SCOPE_INVALID",
      "Tenant-wide knowledge audiences cannot carry a subject scope.",
    );
  }

  return {
    ok: true,
    scope: {
      authority: "SERVER_SIDE",
      tenant: KNOWLEDGE_TENANT,
      audience: candidate.audience,
      dataClassification: candidate.dataClassification,
      ...(affiliateId ? { affiliateId } : {}),
    },
  };
}
