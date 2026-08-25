import { describe, expect, it } from "vitest";
import {
  AI_GATEWAY_CONTRACT,
  AUTOMATION_EVENT_BOUNDARY,
  AUTOMATION_EXECUTE_CONTRACT,
  CANONICAL_DOMAIN_EVENT_REGISTRY,
  CANONICAL_DOMAIN_EVENT_TYPES,
  COMMUNICATIONS_SEND_CONTRACT,
  COMMUNICATIONS_SEND_TOOL_BINDING,
  CONVERSATION_EVENT_BOUNDARY,
  DATA_CLASSIFICATIONS,
  DEFERRED_DOMAIN_EVENT_TYPES,
  DOMAIN_EVENT_ENVELOPE_EVOLUTION,
  DOMAIN_EVENT_PUBLISH_CONTRACT,
  DOMAIN_EVENT_PUBLISH_V2_CONTRACT,
  INITIAL_DOMAIN_EVENT_TYPES,
  KNOWLEDGE_GATEWAY_CONTRACT,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_STATUSES,
  PLAN_LIFECYCLE,
  PLAN_LIFECYCLE_COMMAND_CONTRACT,
  PUBLISHED_PLANS_READ_CONTRACT,
  TEMPLATE_PREVIEW_CONTRACT,
  TOOL_GATEWAY_CONTRACT,
  TOOL_STATUSES,
  canTransitionAutomation,
  canTransitionTemplate,
  isConsentRequirementCompatible,
  isDomainEventEnvelope,
  isDomainEventEnvelopeV2,
  isTransportImplemented,
  promoteConversationEscalation,
  resolveGatewayIdentityLevel,
  validateTemplateDefinition,
  type PublicContract,
} from "./index";

describe("canonical ASODEF Connect gateway contracts", () => {
  it("publishes one canonical plan lifecycle and governed contracts", () => {
    expect(PLAN_LIFECYCLE).toEqual(["DRAFT", "REVIEW", "PUBLISHED", "RETIRED"]);
    for (const contract of [
      PUBLISHED_PLANS_READ_CONTRACT,
      PLAN_LIFECYCLE_COMMAND_CONTRACT,
    ]) {
      expect(contract.version).toBe("1.0.0");
      expect(contract.inputSchema.required.length).toBeGreaterThan(0);
      expect(contract.outputSchema.required.length).toBeGreaterThan(0);
      expect(contract.errors.length).toBeGreaterThan(0);
      expect(contract.permissions.length).toBeGreaterThan(0);
      expect(contract.audit.required).toBe(true);
      expect(contract.idempotency.scope).not.toBe("");
    }
  });
  it("keeps the executable tool lifecycle closed", () => {
    expect(TOOL_STATUSES).toEqual([
      "PUBLISHED",
      "REVIEW",
      "DISABLED",
      "RETIRED",
    ]);
  });

  it("keeps knowledge approval distinct from publication", () => {
    expect(KNOWLEDGE_AUDIENCES).toEqual([
      "PUBLIC",
      "AUTHENTICATED_AFFILIATE",
      "INTERNAL",
      "ADMIN_ONLY",
    ]);
    expect(KNOWLEDGE_STATUSES).toEqual([
      "DRAFT",
      "REVIEW",
      "APPROVED",
      "PUBLISHED",
      "RETIRED",
    ]);
    expect(KNOWLEDGE_GATEWAY_CONTRACT.contextSchema.required).toContain(
      "effectiveScope",
    );
    expect(KNOWLEDGE_GATEWAY_CONTRACT.publication).toContain("ONLY_PUBLISHED");
    expect(JSON.stringify(KNOWLEDGE_GATEWAY_CONTRACT)).not.toMatch(
      /collectionIds|documentId|publishedKnowledgeVersionIds/,
    );
  });

  it("publishes structured errors and policy semantics for every gateway", () => {
    expect(AI_GATEWAY_CONTRACT.errors).toContain("TIMEOUT");
    expect(TOOL_GATEWAY_CONTRACT.errors).toContain("TOOL_NOT_PUBLISHED");
    expect(KNOWLEDGE_GATEWAY_CONTRACT.errors).toContain(
      "KNOWLEDGE_NOT_PUBLISHED",
    );
    expect(
      JSON.stringify([
        AI_GATEWAY_CONTRACT,
        TOOL_GATEWAY_CONTRACT,
        KNOWLEDGE_GATEWAY_CONTRACT,
      ]),
    ).not.toMatch(/OPENROUTER_API_KEY|credential|prisma|sql/i);
  });

  it("maps identity only from explicit authentication evidence", () => {
    expect(
      resolveGatewayIdentityLevel({
        authenticated: false,
        mfaVerified: true,
        stepUpVerified: true,
      }),
    ).toBeNull();
    expect(
      resolveGatewayIdentityLevel({
        authenticated: true,
        mfaVerified: false,
        stepUpVerified: false,
      }),
    ).toBe("AUTHENTICATED");
    expect(
      resolveGatewayIdentityLevel({
        authenticated: true,
        mfaVerified: true,
        stepUpVerified: false,
      }),
    ).toBe("MFA_VERIFIED");
    expect(
      resolveGatewayIdentityLevel({
        authenticated: true,
        mfaVerified: true,
        stepUpVerified: true,
      }),
    ).toBe("STEP_UP_VERIFIED");
  });
});

describe("ASODEF Connect events and communications contracts", () => {
  const contracts: readonly PublicContract<unknown, unknown>[] = [
    DOMAIN_EVENT_PUBLISH_CONTRACT,
    DOMAIN_EVENT_PUBLISH_V2_CONTRACT,
    AUTOMATION_EXECUTE_CONTRACT,
    COMMUNICATIONS_SEND_CONTRACT,
    TEMPLATE_PREVIEW_CONTRACT,
  ];

  it.each(contracts)(
    "$name exposes the mandatory governance metadata",
    (contract) => {
      expect(contract.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(contract.inputSchema.required.length).toBeGreaterThan(0);
      expect(contract.outputSchema.required.length).toBeGreaterThan(0);
      expect(contract.errors.length).toBeGreaterThan(0);
      expect(contract.permissions.length).toBeGreaterThan(0);
      expect(contract.audit.required).toBe(true);
      expect(contract.audit.piiPolicy).toBe("MINIMIZED_NO_CONTENT");
      expect(contract.idempotency.scope).not.toBe("");
    },
  );

  it("registers exactly the approved initial event vocabulary", () => {
    expect(INITIAL_DOMAIN_EVENT_TYPES).toEqual([
      "LeadCreated",
      "OpportunityWon",
      "CompanyCreated",
      "PlanPublished",
      "ContractCreated",
      "ContractApproved",
      "ContractExpiring",
      "PaymentReceived",
      "PaymentFailed",
      "PqrCreated",
      "PqrResolved",
      "ConsentGranted",
      "ConversationEscalated",
      "CommunicationRequested",
      "CommunicationDelivered",
      "CommunicationFailed",
    ]);
  });

  it("validates the versioned envelope and rejects unregistered events", () => {
    const valid = {
      eventId: "b198a56d-7346-4f23-a44e-15d0e5f73d38",
      eventType: "LeadCreated",
      schemaVersion: 1,
      occurredAt: "2026-08-22T12:00:00.000Z",
      producer: "crm",
      subjectType: "lead",
      subjectId: "lead-123",
      correlationId: "corr-123",
      causationId: null,
      idempotencyKey: "crm:lead-123:created",
      payload: {},
    };
    expect(isDomainEventEnvelope(valid)).toBe(true);
    expect(
      isDomainEventEnvelope({ ...valid, eventType: "DirectSqlRequested" }),
    ).toBe(false);
    expect(isDomainEventEnvelope({ ...valid, payload: [] })).toBe(false);
    expect(isDomainEventEnvelope({ ...valid, unexpected: true })).toBe(false);
    expect(
      isDomainEventEnvelope({
        ...valid,
        eventType: "lead.created",
      }),
    ).toBe(false);
  });

  it("publishes the canonical v2 dotted vocabulary and defers ambiguous facts", () => {
    expect(CANONICAL_DOMAIN_EVENT_TYPES).toEqual([
      "lead.created",
      "company.created",
      "contract.created",
      "contract.version.created",
      "contract.cancelled",
      "payment.created",
      "payment.received",
      "payment.failed",
      "pqr.created",
      "pqr.assigned",
      "pqr.resolved",
      "consent.granted",
      "consent.revoked",
      "plan.version.published",
      "plan.retired",
    ]);
    expect(DEFERRED_DOMAIN_EVENT_TYPES).toEqual([
      "lead.updated",
      "lead.qualified",
      "lead.assigned",
      "company.approved",
      "company.updated",
      "contract.signed",
      "pqr.updated",
      "payment.overdue",
    ]);
    expect(CANONICAL_DOMAIN_EVENT_TYPES).not.toContain("pqr.updated");
    expect(CANONICAL_DOMAIN_EVENT_REGISTRY["payment.created"]).toEqual({
      eventType: "payment.created",
      schemaVersion: 1,
      aggregateType: "payment",
    });
    expect(CANONICAL_DOMAIN_EVENT_REGISTRY["plan.version.published"]).toEqual({
      eventType: "plan.version.published",
      schemaVersion: 1,
      aggregateType: "plan",
    });
  });

  it("keeps v1 replay-compatible while requiring new producers to emit v2 only", () => {
    expect(DOMAIN_EVENT_ENVELOPE_EVOLUTION).toEqual({
      legacyV1: {
        contractVersion: "1.0.0",
        producerPolicy: "LEGACY_REPLAY_ONLY",
      },
      canonicalV2: {
        contractVersion: "2.0.0",
        producerPolicy: "EMIT_V2_ONLY",
      },
      persistenceMapping: {
        aggregateType: "subject_type",
        aggregateId: "subject_id",
        sanitizedPayload: "payload",
      },
    });
    expect(DOMAIN_EVENT_PUBLISH_CONTRACT.version).toBe("1.0.0");
    expect(DOMAIN_EVENT_PUBLISH_V2_CONTRACT.version).toBe("2.0.0");
  });

  it("validates v2 without mixing legacy subject or payload fields", () => {
    const valid = {
      eventId: "b198a56d-7346-4f23-a44e-15d0e5f73d38",
      eventType: "lead.created",
      schemaVersion: 1,
      occurredAt: "2026-08-23T12:00:00.000Z",
      producer: "leads",
      aggregateType: "lead",
      aggregateId: "lead-123",
      correlationId: "corr-123",
      causationId: null,
      idempotencyKey: "leads:lead-123:created",
      sanitizedPayload: {},
    };
    expect(isDomainEventEnvelopeV2(valid)).toBe(true);
    expect(
      isDomainEventEnvelopeV2({ ...valid, eventType: "LeadCreated" }),
    ).toBe(false);
    expect(
      isDomainEventEnvelopeV2({
        ...valid,
        subjectType: "lead",
      }),
    ).toBe(false);
    expect(
      isDomainEventEnvelopeV2({
        ...valid,
        sanitizedPayload: [],
      }),
    ).toBe(false);
    expect(
      isDomainEventEnvelopeV2({
        ...valid,
        eventType: "pqr.updated",
      }),
    ).toBe(false);
  });

  it("enforces reviewed lifecycle transitions", () => {
    expect(canTransitionAutomation("DRAFT", "REVIEW")).toBe(true);
    expect(canTransitionAutomation("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransitionAutomation("REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransitionTemplate("REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransitionTemplate("DRAFT", "PUBLISHED")).toBe(false);
  });

  it("exposes only the reviewed EMAIL outbox adapter", () => {
    expect(isTransportImplemented("EMAIL")).toBe(true);
    expect(isTransportImplemented("WHATSAPP")).toBe(false);
    expect(isTransportImplemented("WEB_NOTIFICATION")).toBe(false);
    expect(isTransportImplemented("FUTURE")).toBe(false);
  });

  it("satisfies the canonical Tool Gateway contract without transport access", () => {
    expect(DATA_CLASSIFICATIONS).toEqual([
      "PUBLIC",
      "INTERNAL",
      "PERSONAL",
      "SENSITIVE",
      "HIGHLY_SENSITIVE",
    ]);
    expect(COMMUNICATIONS_SEND_TOOL_BINDING).toMatchObject({
      name: "send_communication",
      operation: "communications.send",
      version: "v1",
      permission: "communications.send",
      status: "REVIEW",
      mode: "RUNTIME_AVAILABLE",
      execution: {
        applicationServiceMethod: "CommunicationsService.send",
        directDataAccess: false,
        directTransportAccess: false,
      },
    });
    expect(COMMUNICATIONS_SEND_CONTRACT.inputSchema.required).not.toEqual(
      expect.arrayContaining(["requestedBy", "correlationId", "causationId"]),
    );
    expect(
      isConsentRequirementCompatible("MARKETING", {
        basis: "EXPLICIT_CONSENT",
        purposeKey: "optional_marketing",
        consentRecordId: "8b73d116-4f1b-4c74-bf48-3216420e1e23",
      }),
    ).toBe(true);
    expect(
      isConsentRequirementCompatible("MARKETING", {
        basis: "CONTRACT",
        purposeKey: null,
        consentRecordId: null,
      }),
    ).toBe(false);
  });

  it("keeps ConversationEvent internal and promotes only an explicit business fact", () => {
    expect(CONVERSATION_EVENT_BOUNDARY.conversationEvent.publication).toBe(
      "NOT_AUTOMATIC",
    );
    const event = promoteConversationEscalation(
      {
        id: "5fc742cb-d60d-46a3-bd84-e6d331f49a3b",
        conversationId: "ea96c6cf-ff4b-4304-ac5f-3d09b174af67",
        eventType: "CONVERSATION_ESCALATED",
        correlationId: "workflow-123",
        idempotencyKey: "conversation-operation-123",
        createdAt: "2026-08-22T18:00:00.000Z",
      },
      {
        eventId: "d7d5b0ee-b3bc-423e-aeb2-2e68d908227d",
        reasonCode: "POLICY_REVIEW",
        escalationKind: "POLICY_REQUIRED",
      },
    );
    expect(event).toMatchObject({
      eventType: "ConversationEscalated",
      schemaVersion: 1,
      correlationId: "workflow-123",
      causationId: "5fc742cb-d60d-46a3-bd84-e6d331f49a3b",
      subjectType: "conversation",
      subjectId: "ea96c6cf-ff4b-4304-ac5f-3d09b174af67",
    });
    expect(event.eventId).not.toBe(event.causationId);
    expect(AUTOMATION_EVENT_BOUNDARY.consumes).toBe("DomainEventEnvelope");
    expect(AUTOMATION_EVENT_BOUNDARY.rejects).toContain("ConversationEvent");
  });

  it("rejects executable or undeclared template syntax", () => {
    expect(
      validateTemplateDefinition(
        ["name"],
        "Hola {{name}}",
        "Bienvenido, {{ name }}.",
      ),
    ).toEqual({ valid: true });
    expect(
      validateTemplateDefinition(["name"], null, "{{#if name}}secreto{{/if}}"),
    ).toEqual({
      valid: false,
      errors: expect.arrayContaining(["TEMPLATE_EXECUTABLE_SYNTAX_FORBIDDEN"]),
    });
    expect(validateTemplateDefinition([], null, "Hola {{unknown}}")).toEqual({
      valid: false,
      errors: ["TEMPLATE_VARIABLE_UNDECLARED"],
    });
    expect(
      validateTemplateDefinition(["constructor"], null, "{{constructor}}"),
    ).toEqual({
      valid: false,
      errors: ["TEMPLATE_VARIABLE_NAME_INVALID"],
    });
  });
});
