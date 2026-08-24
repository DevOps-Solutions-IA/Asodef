import type {
  KnowledgeGroundingOutcome,
} from "@asodef/connect-contracts";
import type {
  KnowledgeClaim,
  KnowledgeTraceability,
  RankedKnowledgeEvidence,
} from "./knowledge-retrieval";

export interface GroundingConflict {
  claimKey: string;
  values: readonly {
    value: string;
    sources: readonly KnowledgeTraceability[];
  }[];
}

export interface GroundingCoverage {
  claimKey: string;
  evidenceCount: number;
  satisfied: boolean;
}

export interface KnowledgeGroundingRequest {
  requiredClaimKeys: readonly string[];
  evidence: readonly RankedKnowledgeEvidence[];
}

export interface KnowledgeGroundingConfig {
  minimumEvidencePerClaim: number;
}

export interface KnowledgeGroundingResult {
  outcome: KnowledgeGroundingOutcome;
  /** Only admissible evidence tied to an explicitly required claim. */
  evidence: readonly RankedKnowledgeEvidence[];
  coverage: readonly GroundingCoverage[];
  conflicts: readonly GroundingConflict[];
  responseDirective:
    | "ANSWER_ONLY_FROM_EVIDENCE"
    | "QUALIFY_AND_LIMIT_TO_EVIDENCE"
    | "DO_NOT_ANSWER_WITHOUT_EVIDENCE"
    | "DO_NOT_GUESS_ESCALATE_CONFLICT";
}

/**
 * Evaluates evidence coverage without generating prose or selecting a value
 * from contradictory sources. Callers must obey the returned directive.
 */
export function groundKnowledge(
  request: KnowledgeGroundingRequest,
  config: KnowledgeGroundingConfig,
): KnowledgeGroundingResult {
  const requiredClaimKeys = normalizeRequiredClaims(request.requiredClaimKeys);
  if (
    !Number.isInteger(config.minimumEvidencePerClaim) ||
    config.minimumEvidencePerClaim < 1
  ) {
    throw new Error("INVALID_GROUNDING_CONFIG");
  }

  const required = new Set(requiredClaimKeys);
  const relevantEvidence = request.evidence.filter((item) =>
    (item.claims ?? []).some((claim) => required.has(normalizeKey(claim.key))),
  );
  const conflicts = findConflicts(requiredClaimKeys, relevantEvidence);
  const coverage = requiredClaimKeys.map((claimKey) => {
    const evidenceCount = relevantEvidence.filter((item) =>
      (item.claims ?? []).some((claim) => normalizeKey(claim.key) === claimKey),
    ).length;
    return {
      claimKey,
      evidenceCount,
      satisfied: evidenceCount >= config.minimumEvidencePerClaim,
    };
  });

  if (relevantEvidence.length === 0) {
    return {
      outcome: "NO_EVIDENCE",
      evidence: [],
      coverage,
      conflicts: [],
      responseDirective: "DO_NOT_ANSWER_WITHOUT_EVIDENCE",
    };
  }
  if (conflicts.length > 0) {
    return {
      outcome: "SOURCE_CONFLICT",
      evidence: relevantEvidence,
      coverage,
      conflicts,
      responseDirective: "DO_NOT_GUESS_ESCALATE_CONFLICT",
    };
  }
  if (coverage.every((item) => item.satisfied)) {
    return {
      outcome: "SUFFICIENT_EVIDENCE",
      evidence: relevantEvidence,
      coverage,
      conflicts: [],
      responseDirective: "ANSWER_ONLY_FROM_EVIDENCE",
    };
  }
  return {
    outcome: "PARTIAL_EVIDENCE",
    evidence: relevantEvidence,
    coverage,
    conflicts: [],
    responseDirective: "QUALIFY_AND_LIMIT_TO_EVIDENCE",
  };
}

function findConflicts(
  requiredClaimKeys: readonly string[],
  evidence: readonly RankedKnowledgeEvidence[],
): GroundingConflict[] {
  const conflicts: GroundingConflict[] = [];
  for (const claimKey of requiredClaimKeys) {
    const values = new Map<
      string,
      { value: string; sources: KnowledgeTraceability[] }
    >();
    for (const item of evidence) {
      for (const claim of item.claims ?? []) {
        if (normalizeKey(claim.key) !== claimKey) continue;
        const normalizedValue = normalizeValue(claim);
        const existing = values.get(normalizedValue) ?? {
          value: claim.value,
          sources: [],
        };
        existing.sources.push(item.trace);
        values.set(normalizedValue, existing);
      }
    }
    if (values.size > 1) {
      conflicts.push({ claimKey, values: [...values.values()] });
    }
  }
  return conflicts;
}

function normalizeRequiredClaims(claimKeys: readonly string[]): string[] {
  const normalized = claimKeys.map(normalizeKey);
  if (normalized.length === 0 || normalized.some((key) => !key))
    throw new Error("GROUNDING_CLAIMS_REQUIRED");
  const unique = [...new Set(normalized)];
  if (unique.length !== normalized.length)
    throw new Error("DUPLICATE_GROUNDING_CLAIM");
  return unique;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeValue(claim: KnowledgeClaim): string {
  return claim.value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}
