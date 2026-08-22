import type {
  KnowledgePublication,
  KnowledgeStatus,
} from "@asodef/connect-contracts";

export {
  KNOWLEDGE_GATEWAY_CONTRACT,
  KNOWLEDGE_STATUSES,
  type KnowledgeCollection,
  type KnowledgeDocument,
  type KnowledgeGateway,
  type KnowledgeGatewayCitation,
  type KnowledgeGatewayError,
  type KnowledgeGatewayErrorCode,
  type KnowledgeGatewayRequest,
  type KnowledgeGatewayResponse,
  type KnowledgeGatewayResult,
  type KnowledgeLifecycleRecord,
  type KnowledgePublication,
  type KnowledgeSource,
  type KnowledgeStatus,
  type KnowledgeVersion,
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

export class KnowledgePublicationPolicy {
  assertTransition(current: KnowledgeStatus, next: KnowledgeStatus): void {
    if (!ALLOWED_TRANSITIONS[current].includes(next))
      throw new Error(`INVALID_KNOWLEDGE_TRANSITION:${current}:${next}`);
  }

  assertKoralReadable(publication: KnowledgePublication): void {
    if (publication.status !== "PUBLISHED")
      throw new Error("KNOWLEDGE_NOT_PUBLISHED");
    if (publication.publishedKnowledgeVersionIds.length === 0)
      throw new Error("EMPTY_KNOWLEDGE_PUBLICATION");
  }
}
