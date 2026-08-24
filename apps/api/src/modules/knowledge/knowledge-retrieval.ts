import type {
  DataClassification,
  KnowledgeStatus,
} from "@asodef/connect-contracts";

export interface KnowledgeTraceability {
  itemId: string;
  versionId: string;
  chunkId: string;
  sourceId: string;
}

export interface KnowledgeClaim {
  key: string;
  value: string;
}

export interface KnowledgeRetrievalCandidate {
  trace: KnowledgeTraceability;
  tenantId: string;
  audiences: readonly string[];
  dataClassification: DataClassification;
  publicationStatus: KnowledgeStatus;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  language: string;
  content: string;
  claims?: readonly KnowledgeClaim[];
}

export interface ScoredKnowledgeCandidate {
  candidate: KnowledgeRetrievalCandidate;
  /** A normalized score produced by the owning search implementation. */
  score: number;
}

/** Trusted values resolved by the server. They must never be populated from
 * prompt text or arbitrary model output. */
export interface KnowledgeRetrievalServerScope {
  tenantId: string;
  audience: string;
  maximumDataClassification: DataClassification;
  language: "es";
  effectiveAt: string;
}

export interface HybridRetrievalRequest {
  query: string;
  serverScope: KnowledgeRetrievalServerScope;
  keywordCandidates: readonly ScoredKnowledgeCandidate[];
  semanticCandidates: readonly ScoredKnowledgeCandidate[];
}

export interface HybridRetrievalConfig {
  keywordWeight: number;
  semanticWeight: number;
  minimumFusedScore: number;
  limit: number;
}

export interface RankedKnowledgeEvidence extends KnowledgeRetrievalCandidate {
  keywordScore: number;
  semanticScore: number;
  fusedScore: number;
  rank: number;
}

export interface HybridRetrievalResult {
  strategy: "HYBRID_RETRIEVAL";
  evidence: readonly RankedKnowledgeEvidence[];
  appliedFilters: {
    tenantId: string;
    audience: string;
    maximumDataClassification: DataClassification;
    publicationStatus: "PUBLISHED";
    effectiveAt: string;
    language: "es";
  };
}

const CLASSIFICATION_RANK: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PERSONAL: 2,
  SENSITIVE: 3,
  HIGHLY_SENSITIVE: 4,
};

interface MergedCandidate {
  candidate: KnowledgeRetrievalCandidate;
  keywordScore: number;
  semanticScore: number;
}

/**
 * Pure retrieval boundary. Storage engines own keyword/vector generation;
 * this pipeline first enforces admissibility and then applies injected fusion
 * policy. Consequently an inadmissible candidate cannot influence ranking.
 */
export function retrievePublishedKnowledge(
  request: HybridRetrievalRequest,
  config: HybridRetrievalConfig,
): HybridRetrievalResult {
  validateRequest(request);
  validateConfig(config);

  const merged = new Map<string, MergedCandidate>();
  mergeChannel(
    merged,
    "keywordScore",
    request.keywordCandidates,
    request.serverScope,
  );
  mergeChannel(
    merged,
    "semanticScore",
    request.semanticCandidates,
    request.serverScope,
  );

  const weightTotal = config.keywordWeight + config.semanticWeight;
  const evidence = [...merged.values()]
    .map(({ candidate, keywordScore, semanticScore }) => ({
      ...candidate,
      keywordScore,
      semanticScore,
      fusedScore:
        (keywordScore * config.keywordWeight +
          semanticScore * config.semanticWeight) /
        weightTotal,
    }))
    .filter((candidate) => candidate.fusedScore >= config.minimumFusedScore)
    .sort(compareEvidence)
    .slice(0, config.limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    strategy: "HYBRID_RETRIEVAL",
    evidence,
    appliedFilters: {
      tenantId: request.serverScope.tenantId,
      audience: request.serverScope.audience,
      maximumDataClassification: request.serverScope.maximumDataClassification,
      publicationStatus: "PUBLISHED",
      effectiveAt: request.serverScope.effectiveAt,
      language: request.serverScope.language,
    },
  };
}

function mergeChannel(
  merged: Map<string, MergedCandidate>,
  channel: "keywordScore" | "semanticScore",
  hits: readonly ScoredKnowledgeCandidate[],
  scope: KnowledgeRetrievalServerScope,
): void {
  for (const hit of hits) {
    validateScore(hit.score);
    if (!isAdmissible(hit.candidate, scope)) continue;

    const key = traceKey(hit.candidate.trace);
    const existing = merged.get(key);
    if (existing && !isSameCandidate(existing.candidate, hit.candidate)) {
      throw new Error(`INCONSISTENT_KNOWLEDGE_TRACE:${key}`);
    }
    const next = existing ?? {
      candidate: hit.candidate,
      keywordScore: 0,
      semanticScore: 0,
    };
    next[channel] = Math.max(next[channel], hit.score);
    merged.set(key, next);
  }
}

function isAdmissible(
  candidate: KnowledgeRetrievalCandidate,
  scope: KnowledgeRetrievalServerScope,
): boolean {
  if (candidate.tenantId !== scope.tenantId) return false;
  if (!candidate.audiences.includes(scope.audience)) return false;
  if (candidate.publicationStatus !== "PUBLISHED") return false;
  if (candidate.language.toLowerCase() !== scope.language) return false;
  // Highly-sensitive material is never eligible for LLM prompt context,
  // even when an administrator has the clearance to manage or preview it.
  if (candidate.dataClassification === "HIGHLY_SENSITIVE") return false;

  const candidateRank = CLASSIFICATION_RANK[candidate.dataClassification];
  const maximumRank = CLASSIFICATION_RANK[scope.maximumDataClassification];
  if (candidateRank === undefined || maximumRank === undefined) return false;
  if (candidateRank > maximumRank) return false;

  const effectiveAt = Date.parse(scope.effectiveAt);
  const effectiveFrom = parseOptionalDate(candidate.effectiveFrom);
  const effectiveTo = parseOptionalDate(candidate.effectiveTo);
  if (effectiveFrom === "INVALID" || effectiveTo === "INVALID") return false;
  if (effectiveFrom !== null && effectiveFrom > effectiveAt) return false;
  // Effective intervals are [from, to); at `effectiveTo` the item is expired.
  if (effectiveTo !== null && effectiveTo <= effectiveAt) return false;
  return true;
}

function parseOptionalDate(
  value: string | null | undefined,
): number | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : "INVALID";
}

function validateRequest(request: HybridRetrievalRequest): void {
  if (!request.query.trim()) throw new Error("KNOWLEDGE_QUERY_REQUIRED");
  if (!request.serverScope.tenantId.trim())
    throw new Error("SERVER_TENANT_SCOPE_REQUIRED");
  if (!request.serverScope.audience.trim())
    throw new Error("KNOWLEDGE_AUDIENCE_REQUIRED");
  if (!Number.isFinite(Date.parse(request.serverScope.effectiveAt)))
    throw new Error("INVALID_KNOWLEDGE_EFFECTIVE_AT");
}

function validateConfig(config: HybridRetrievalConfig): void {
  for (const value of [
    config.keywordWeight,
    config.semanticWeight,
    config.minimumFusedScore,
  ]) {
    if (!Number.isFinite(value) || value < 0)
      throw new Error("INVALID_HYBRID_RETRIEVAL_CONFIG");
  }
  if (config.keywordWeight + config.semanticWeight <= 0)
    throw new Error("INVALID_HYBRID_RETRIEVAL_CONFIG");
  if (config.minimumFusedScore > 1)
    throw new Error("INVALID_HYBRID_RETRIEVAL_CONFIG");
  if (!Number.isInteger(config.limit) || config.limit < 1)
    throw new Error("INVALID_HYBRID_RETRIEVAL_CONFIG");
}

function validateScore(score: number): void {
  if (!Number.isFinite(score) || score < 0 || score > 1)
    throw new Error("INVALID_RETRIEVAL_SCORE");
}

function traceKey(trace: KnowledgeTraceability): string {
  return [trace.itemId, trace.versionId, trace.chunkId, trace.sourceId].join(
    ":",
  );
}

function isSameCandidate(
  left: KnowledgeRetrievalCandidate,
  right: KnowledgeRetrievalCandidate,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.dataClassification === right.dataClassification &&
    left.publicationStatus === right.publicationStatus &&
    left.language === right.language &&
    left.content === right.content &&
    left.effectiveFrom === right.effectiveFrom &&
    left.effectiveTo === right.effectiveTo &&
    JSON.stringify(left.audiences) === JSON.stringify(right.audiences) &&
    JSON.stringify(left.claims ?? []) === JSON.stringify(right.claims ?? [])
  );
}

function compareEvidence(
  left: Omit<RankedKnowledgeEvidence, "rank">,
  right: Omit<RankedKnowledgeEvidence, "rank">,
): number {
  return (
    right.fusedScore - left.fusedScore ||
    right.semanticScore - left.semanticScore ||
    right.keywordScore - left.keywordScore ||
    traceKey(left.trace).localeCompare(traceKey(right.trace))
  );
}
