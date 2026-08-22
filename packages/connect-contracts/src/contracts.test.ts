import { describe, expect, it } from "vitest";
import {
  AUTOMATION_EXECUTE_CONTRACT,
  AUTOMATION_EVENT_BOUNDARY,
  COMMUNICATIONS_SEND_TOOL_BINDING,
  COMMUNICATIONS_SEND_CONTRACT,
  CONNECT_DATA_CLASSIFICATIONS,
  CONVERSATION_EVENT_BOUNDARY,
  DOMAIN_EVENT_PUBLISH_CONTRACT,
  INITIAL_DOMAIN_EVENT_TYPES,
  TEMPLATE_PREVIEW_CONTRACT,
  canTransitionAutomation,
  canTransitionTemplate,
  isDomainEventEnvelope,
  isConsentRequirementCompatible,
  isTransportImplemented,
  promoteConversationEscalation,
  validateTemplateDefinition,
  type PublicContract,
} from "./index";

describe("ASODEF Connect public contracts", () => {
  const contracts: readonly PublicContract<unknown, unknown>[] = [
    DOMAIN_EVENT_PUBLISH_CONTRACT,
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
  });

  it("enforces reviewed lifecycle transitions", () => {
    expect(canTransitionAutomation("DRAFT", "REVIEW")).toBe(true);
    expect(canTransitionAutomation("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransitionAutomation("REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransitionTemplate("REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransitionTemplate("DRAFT", "PUBLISHED")).toBe(false);
  });

  it("allows only the existing EMAIL adapter", () => {
    expect(isTransportImplemented("EMAIL")).toBe(true);
    expect(isTransportImplemented("WHATSAPP")).toBe(false);
    expect(isTransportImplemented("WEB_NOTIFICATION")).toBe(false);
    expect(isTransportImplemented("FUTURE")).toBe(false);
  });

  it("reconciles the PR #20 Tool Gateway binding without exposing transport access", () => {
    expect(CONNECT_DATA_CLASSIFICATIONS).toEqual([
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
      runtimeAvailability: "CONTRACT_ONLY",
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

  it("keeps PR #19 ConversationEvent internal and explicitly promotes only a business fact", () => {
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

  it("accepts declared interpolation and rejects executable or undeclared template syntax", () => {
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
