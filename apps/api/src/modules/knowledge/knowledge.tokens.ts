import type { BinaryKnowledgeParser } from "./knowledge-parser";
import type { HybridRetrievalConfig } from "./knowledge-retrieval";

export const KNOWLEDGE_BINARY_PARSERS = Symbol("KNOWLEDGE_BINARY_PARSERS");
export const KNOWLEDGE_RETRIEVAL_CONFIG = Symbol("KNOWLEDGE_RETRIEVAL_CONFIG");

export interface KnowledgeRuntimeRetrievalConfig extends HybridRetrievalConfig {
  candidateLimit: number;
  sufficientEvidenceScore: number;
}

export const DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG: KnowledgeRuntimeRetrievalConfig =
  {
    candidateLimit: 100,
    keywordWeight: 1,
    semanticWeight: 0,
    minimumFusedScore: 0.05,
    sufficientEvidenceScore: 0.6,
    limit: 10,
  };

export type KnowledgeBinaryParsers = readonly BinaryKnowledgeParser[];
