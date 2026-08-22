import type { DomainEventEnvelope } from "./domain-events";

export const CROSS_CONTRACT_RECONCILIATION_VERSION = "1.0.0" as const;

/** Structural view of Koral's append-only ConversationEvent. It is an
 * internal conversation timeline/audit record, not an integration envelope. */
export interface ConversationEventReference {
  id: string;
  conversationId: string;
  eventType: string;
  correlationId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface CrossContractTrace {
  /** Stable across the whole workflow and inherited from the authenticated
   * gateway/conversation context. */
  correlationId: string;
  /** Direct predecessor command/event reference, not the workflow root. */
  causationId: string | null;
}

export const CONVERSATION_EVENT_BOUNDARY = Object.freeze({
  version: CROSS_CONTRACT_RECONCILIATION_VERSION,
  conversationEvent: {
    purpose: "INTERNAL_CONVERSATION_TIMELINE_AND_AUDIT",
    storage: "conversation_events",
    publication: "NOT_AUTOMATIC",
  },
  domainEvent: {
    purpose: "BUSINESS_OR_INTEGRATION_FACT_FOR_CONSUMERS",
    storage: "DURABLE_EVENT_OUTBOX_REQUIRED",
    publication: "EXPLICIT_PROMOTION_ONLY",
  },
  promotionRules: {
    newEventId: true,
    inheritCorrelationId: true,
    causationId: "ConversationEvent.id",
    occurredAt: "ConversationEvent.createdAt",
    producer: "koral-conversations",
    subjectType: "conversation",
    subjectId: "ConversationEvent.conversationId",
    deriveLayerSpecificIdempotencyKey: true,
    copyMessageBodyOrRawMetadata: false,
  },
} as const);

export const PUBLISHABLE_CONVERSATION_EVENT_TYPES = [
  "CONVERSATION_ESCALATED",
] as const;

/** Only an explicitly classified business escalation is currently registered
 * for promotion. MESSAGE_RECEIVED, assignment and internal-note timeline
 * entries remain ConversationEvents unless a future reviewed contract adds a
 * business event—there is no generic one-to-one envelope conversion. */
export function promoteConversationEscalation(
  source: ConversationEventReference,
  input: {
    eventId: string;
    reasonCode: string;
    escalationKind: "HUMAN_REQUIRED" | "POLICY_REQUIRED" | "SERVICE_REQUIRED";
  },
): DomainEventEnvelope<{
  reasonCode: string;
  escalationKind: "HUMAN_REQUIRED" | "POLICY_REQUIRED" | "SERVICE_REQUIRED";
}> {
  if (source.eventType !== "CONVERSATION_ESCALATED") {
    throw new Error("CONVERSATION_EVENT_NOT_PUBLISHABLE");
  }
  if (!source.correlationId) {
    throw new Error("CONVERSATION_EVENT_CORRELATION_REQUIRED_FOR_PUBLICATION");
  }
  return {
    eventId: input.eventId,
    eventType: "ConversationEscalated",
    schemaVersion: 1,
    occurredAt: source.createdAt,
    producer: "koral-conversations",
    subjectType: "conversation",
    subjectId: source.conversationId,
    correlationId: source.correlationId,
    causationId: source.id,
    idempotencyKey: `conversation-event:${source.id}:ConversationEscalated:v1`,
    payload: {
      reasonCode: input.reasonCode,
      escalationKind: input.escalationKind,
    },
  };
}

export const TOOL_EXECUTION_BOUNDARY = Object.freeze({
  version: CROSS_CONTRACT_RECONCILIATION_VERSION,
  requestContract: "ToolGatewayRequest@v1",
  trustedContextContract: "GatewayRequestContext@v1",
  effectiveActorId: "GatewayRequestContext.identity.effectiveActorId",
  correlationId: "GatewayRequestContext.audit.correlationId",
  causationId:
    "GatewayRequestContext.audit.causationId; direct triggering DomainEvent.eventId, explicitly promoted ConversationEvent.id or authorized command reference",
  idempotencyKey:
    "ToolGatewayRequest.idempotencyKey; required for mutations and operation-scoped rather than copied blindly from a DomainEvent",
  dataClassification:
    "GatewayRequestContext.policy.dataClassification uses canonical DataClassification",
  audit:
    "ToolGateway auditEventId links the invocation; domain and automation audits remain authoritative for their own decisions",
  directDataAccess: false,
  directTransportAccess: false,
} as const);

export const AUTOMATION_EVENT_BOUNDARY = Object.freeze({
  version: CROSS_CONTRACT_RECONCILIATION_VERSION,
  consumes: "DomainEventEnvelope",
  rejects: ["ConversationEvent", "SQL row", "Prisma model", "Redis message"],
  flow: [
    "Domain module",
    "DomainEvent",
    "Automation Engine",
    "communications.send",
    "existing EMAIL outbox adapter",
  ],
  directDomainCoupling: false,
} as const);
