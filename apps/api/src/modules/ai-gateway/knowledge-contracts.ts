import type { JsonSchema } from "./ai-contracts";
import type { DataClassification } from "./data-classification";

export const KNOWLEDGE_STATUSES = ["DRAFT", "REVIEW", "APPROVED", "PUBLISHED", "RETIRED"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

interface KnowledgeLifecycleRecord {
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
  audit: { event: "ai.knowledge.source.read"; recordActor: true; recordResult: true };
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

const ALLOWED_TRANSITIONS: Readonly<Record<KnowledgeStatus, readonly KnowledgeStatus[]>> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["PUBLISHED", "RETIRED"],
  PUBLISHED: ["RETIRED"],
  RETIRED: [],
};

export class KnowledgePublicationPolicy {
  assertTransition(current: KnowledgeStatus, next: KnowledgeStatus): void {
    if (!ALLOWED_TRANSITIONS[current].includes(next)) throw new Error(`INVALID_KNOWLEDGE_TRANSITION:${current}:${next}`);
  }

  assertKoralReadable(publication: KnowledgePublication): void {
    if (publication.status !== "PUBLISHED") throw new Error("KNOWLEDGE_NOT_PUBLISHED");
    if (publication.publishedKnowledgeVersionIds.length === 0) throw new Error("EMPTY_KNOWLEDGE_PUBLICATION");
  }
}
