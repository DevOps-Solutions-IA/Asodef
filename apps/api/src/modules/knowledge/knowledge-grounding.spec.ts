import { groundKnowledge } from "./knowledge-grounding";
import type { RankedKnowledgeEvidence } from "./knowledge-retrieval";

function evidence(
  itemId: string,
  claims: RankedKnowledgeEvidence["claims"],
): RankedKnowledgeEvidence {
  return {
    trace: {
      itemId,
      versionId: `version-${itemId}`,
      chunkId: `chunk-${itemId}`,
      sourceId: `source-${itemId}`,
    },
    tenantId: "asodef",
    audiences: ["KORAL"],
    dataClassification: "INTERNAL",
    publicationStatus: "PUBLISHED",
    language: "es",
    content: `Evidencia ${itemId}`,
    claims,
    keywordScore: 0.8,
    semanticScore: 0.8,
    fusedScore: 0.8,
    rank: 1,
  };
}

describe("groundKnowledge", () => {
  const config = { minimumEvidencePerClaim: 1 };

  it("returns sufficient evidence with item/version/chunk/source traceability", () => {
    const plan = evidence("plan", [{ key: "plan.status", value: "Activo" }]);
    const price = evidence("price", [
      { key: "plan.price", value: "50000 COP" },
    ]);

    const result = groundKnowledge(
      {
        requiredClaimKeys: ["plan.status", "plan.price"],
        evidence: [plan, price],
      },
      config,
    );

    expect(result.outcome).toBe("SUFFICIENT_EVIDENCE");
    expect(result.responseDirective).toBe("ANSWER_ONLY_FROM_EVIDENCE");
    expect(result.evidence.map((item) => item.trace)).toEqual([
      plan.trace,
      price.trace,
    ]);
    expect(result.coverage.every((item) => item.satisfied)).toBe(true);
  });

  it("never invents an answer when no relevant evidence exists", () => {
    const result = groundKnowledge(
      {
        requiredClaimKeys: ["contract.term"],
        evidence: [
          evidence("unrelated", [{ key: "plan.status", value: "Activo" }]),
        ],
      },
      config,
    );

    expect(result).toMatchObject({
      outcome: "NO_EVIDENCE",
      evidence: [],
      conflicts: [],
      responseDirective: "DO_NOT_ANSWER_WITHOUT_EVIDENCE",
    });
  });

  it("qualifies partial evidence instead of claiming complete coverage", () => {
    const result = groundKnowledge(
      {
        requiredClaimKeys: ["plan.status", "plan.price"],
        evidence: [evidence("plan", [{ key: "plan.status", value: "Activo" }])],
      },
      config,
    );

    expect(result.outcome).toBe("PARTIAL_EVIDENCE");
    expect(result.responseDirective).toBe("QUALIFY_AND_LIMIT_TO_EVIDENCE");
    expect(result.coverage).toEqual([
      { claimKey: "plan.status", evidenceCount: 1, satisfied: true },
      { claimKey: "plan.price", evidenceCount: 0, satisfied: false },
    ]);
  });

  it("reports source conflicts and never guesses which source is correct", () => {
    const first = evidence("first", [
      { key: "contract.term", value: "12 meses" },
    ]);
    const second = evidence("second", [
      { key: "contract.term", value: "24 meses" },
    ]);

    const result = groundKnowledge(
      {
        requiredClaimKeys: ["contract.term"],
        evidence: [first, second],
      },
      config,
    );

    expect(result.outcome).toBe("SOURCE_CONFLICT");
    expect(result.responseDirective).toBe("DO_NOT_GUESS_ESCALATE_CONFLICT");
    expect(result.conflicts).toEqual([
      {
        claimKey: "contract.term",
        values: [
          { value: "12 meses", sources: [first.trace] },
          { value: "24 meses", sources: [second.trace] },
        ],
      },
    ]);
  });
});
