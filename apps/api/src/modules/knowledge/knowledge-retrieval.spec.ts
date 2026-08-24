import {
  retrievePublishedKnowledge,
  type HybridRetrievalConfig,
  type KnowledgeRetrievalCandidate,
} from "./knowledge-retrieval";

const config: HybridRetrievalConfig = {
  keywordWeight: 0.4,
  semanticWeight: 0.6,
  minimumFusedScore: 0.2,
  limit: 10,
};

const scope = {
  tenantId: "asodef",
  audience: "KORAL",
  maximumDataClassification: "SENSITIVE" as const,
  language: "es" as const,
  effectiveAt: "2026-08-24T12:00:00.000Z",
};

function candidate(
  overrides: Partial<KnowledgeRetrievalCandidate> = {},
): KnowledgeRetrievalCandidate {
  return {
    trace: {
      itemId: "item-1",
      versionId: "version-1",
      chunkId: "chunk-1",
      sourceId: "source-1",
    },
    tenantId: "asodef",
    audiences: ["KORAL"],
    dataClassification: "INTERNAL",
    publicationStatus: "PUBLISHED",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2027-01-01T00:00:00.000Z",
    language: "es",
    content: "Contenido aprobado",
    claims: [{ key: "plan.status", value: "Activo" }],
    ...overrides,
  };
}

describe("retrievePublishedKnowledge", () => {
  it("applies every metadata filter before returning evidence", () => {
    const admissible = candidate();
    const excluded = [
      candidate({
        trace: { ...admissible.trace, chunkId: "cross-tenant" },
        tenantId: "tenant-b",
      }),
      candidate({
        trace: { ...admissible.trace, chunkId: "wrong-audience" },
        audiences: ["ADMIN"],
      }),
      candidate({
        trace: { ...admissible.trace, chunkId: "draft" },
        publicationStatus: "DRAFT",
      }),
      candidate({
        trace: { ...admissible.trace, chunkId: "future" },
        effectiveFrom: "2026-08-25T00:00:00.000Z",
      }),
      candidate({
        trace: { ...admissible.trace, chunkId: "expired" },
        effectiveTo: scope.effectiveAt,
      }),
      candidate({
        trace: { ...admissible.trace, chunkId: "highly-sensitive" },
        dataClassification: "HIGHLY_SENSITIVE",
      }),
      candidate({
        trace: { ...admissible.trace, chunkId: "wrong-language" },
        language: "en",
      }),
    ];

    const result = retrievePublishedKnowledge(
      {
        query: "plan activo",
        serverScope: scope,
        keywordCandidates: [
          { candidate: admissible, score: 0.6 },
          ...excluded.map((item) => ({ candidate: item, score: 1 })),
        ],
        semanticCandidates: [],
      },
      config,
    );

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]?.trace).toEqual(admissible.trace);
    expect(result.appliedFilters).toEqual({
      tenantId: "asodef",
      audience: "KORAL",
      maximumDataClassification: "SENSITIVE",
      publicationStatus: "PUBLISHED",
      effectiveAt: scope.effectiveAt,
      language: "es",
    });
  });

  it("fuses keyword and semantic candidates with injected policy and stable ordering", () => {
    const first = candidate({
      trace: {
        itemId: "item-a",
        versionId: "version-2",
        chunkId: "chunk-a",
        sourceId: "source-a",
      },
    });
    const second = candidate({
      trace: {
        itemId: "item-b",
        versionId: "version-3",
        chunkId: "chunk-b",
        sourceId: "source-b",
      },
      content: "Otra fuente publicada",
    });

    const result = retrievePublishedKnowledge(
      {
        query: "plan activo",
        serverScope: scope,
        keywordCandidates: [
          { candidate: second, score: 0.6 },
          { candidate: first, score: 0.9 },
        ],
        semanticCandidates: [
          { candidate: first, score: 0.5 },
          { candidate: second, score: 0.8 },
        ],
      },
      config,
    );

    expect(result.evidence.map((item) => item.trace.itemId)).toEqual([
      "item-b",
      "item-a",
    ]);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        trace: second.trace,
        keywordScore: 0.6,
        semanticScore: 0.8,
        fusedScore: 0.72,
        rank: 1,
      }),
      expect.objectContaining({
        trace: first.trace,
        keywordScore: 0.9,
        semanticScore: 0.5,
        fusedScore: 0.66,
        rank: 2,
      }),
    ]);
  });

  it("fails closed for invalid server scope and scoring configuration", () => {
    expect(() =>
      retrievePublishedKnowledge(
        {
          query: "consulta",
          serverScope: { ...scope, tenantId: "" },
          keywordCandidates: [],
          semanticCandidates: [],
        },
        config,
      ),
    ).toThrow("SERVER_TENANT_SCOPE_REQUIRED");

    expect(() =>
      retrievePublishedKnowledge(
        {
          query: "consulta",
          serverScope: scope,
          keywordCandidates: [],
          semanticCandidates: [],
        },
        { ...config, keywordWeight: 0, semanticWeight: 0 },
      ),
    ).toThrow("INVALID_HYBRID_RETRIEVAL_CONFIG");
  });
});
