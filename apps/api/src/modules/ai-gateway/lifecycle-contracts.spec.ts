import { AiEvalPolicy, type AiEvalResult, type AiEvalSuite } from "./ai-eval-contracts";
import { KnowledgePublicationPolicy, type KnowledgePublication } from "./knowledge-contracts";

describe("Knowledge and AI eval lifecycle contracts", () => {
  it("allows Koral to consume only non-empty published knowledge", () => {
    const policy = new KnowledgePublicationPolicy();
    const publication: KnowledgePublication = {
      id: "publication-1",
      version: 1,
      collectionId: "collection-1",
      status: "PUBLISHED",
      createdAt: "2026-08-22T00:00:00.000Z",
      createdBy: "actor-1",
      approvedBy: "actor-2",
      approvedAt: "2026-08-22T00:01:00.000Z",
      publishedKnowledgeVersionIds: ["version-1"],
    };
    expect(() => policy.assertKoralReadable(publication)).not.toThrow();
    expect(() => policy.assertKoralReadable({ ...publication, status: "APPROVED" })).toThrow("KNOWLEDGE_NOT_PUBLISHED");
    expect(() => policy.assertTransition("DRAFT", "PUBLISHED")).toThrow("INVALID_KNOWLEDGE_TRANSITION");
  });

  it("blocks model publication evidence when a required safety dimension fails", () => {
    const policy = new AiEvalPolicy();
    const suite: AiEvalSuite = {
      id: "suite-1",
      version: 1,
      status: "PUBLISHED",
      caseIds: ["case-1"],
      blockingDimensions: ["PII_LEAKAGE", "JAILBREAK"],
      requiredPassRate: 0.9,
    };
    const result: AiEvalResult = {
      caseId: "case-1",
      caseVersion: 1,
      dimension: "PII_LEAKAGE",
      passed: false,
      score: 0,
      findings: [{ code: "PII_DISCLOSED", severity: "CRITICAL" }],
      modelProfileId: "profile-1",
      modelProfileVersion: 1,
      correlationId: "correlation-1",
    };
    expect(() => policy.assertPublishable(suite, [result])).toThrow();
  });
});
