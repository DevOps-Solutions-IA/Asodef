import { defineGovernedTool } from "../../ai-gateway/tool-contract.factory";
import type { GovernedToolContract } from "../../ai-gateway/tool-gateway.types";

export type CrmToolName =
  | "search_leads"
  | "get_lead"
  | "create_lead"
  | "update_lead"
  | "list_opportunities"
  | "get_opportunity"
  | "update_opportunity_stage"
  | "create_activity"
  | "complete_activity"
  | "get_company"
  | "get_partner"
  | "create_followup";

const objectOutput = (entity: string) => ({
  type: "object",
  additionalProperties: false,
  required: ["data", "meta"],
  properties: {
    data: { type: "object", description: entity },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["requestId"],
      properties: { requestId: { type: "string" } },
    },
  },
});

const idInput = (field: string) => ({
  type: "object",
  additionalProperties: false,
  required: [field],
  properties: { [field]: { type: "string", format: "uuid" } },
});

const mutationInput = (properties: Readonly<Record<string, unknown>>, required: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [...required, "idempotencyKey"],
  properties: {
    ...properties,
    idempotencyKey: { type: "string", minLength: 16, maxLength: 100 },
  },
});

/** Declarative only: no route, chatbot, data client or privileged bypass is
 * registered here. Tool Gateway must authenticate and invoke only the named
 * brownfield application service after all published policies pass. */
export const CRM_TOOL_CONTRACTS: Readonly<Record<CrmToolName, GovernedToolContract>> = {
  search_leads: defineGovernedTool({
    name: "search_leads",
    description: "Search the bounded CRM lead view with stable server-side pagination.",
    permission: "crm.read",
    applicationServiceMethod: "CrmService.listLeads",
    mutation: false,
    dataClassification: "PERSONAL",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        search: { type: "string", maxLength: 120 },
        status: { type: "string", maxLength: 50 },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    outputSchema: objectOutput("Paginated lead list"),
    redactFields: ["email", "phone", "documentNumber"],
  }),
  get_lead: defineGovernedTool({
    name: "get_lead",
    description: "Read one CRM lead after the corresponding application-service contract is implemented.",
    permission: "crm.read",
    applicationServiceMethod: "CrmService.getLead",
    mutation: false,
    dataClassification: "PERSONAL",
    status: "REVIEW",
    inputSchema: idInput("leadId"),
    outputSchema: objectOutput("Lead"),
    redactFields: ["email", "phone", "documentNumber"],
  }),
  create_lead: defineGovernedTool({
    name: "create_lead",
    description: "Create a lead using the governed guided-lead workflow and consent evidence.",
    permission: "crm.manage",
    applicationServiceMethod: "LeadsService.createGuided",
    mutation: true,
    dataClassification: "PERSONAL",
    inputSchema: mutationInput(
      {
        audience: { enum: ["person", "affiliate", "company", "ally", "orientation"] },
        need: { type: "string", minLength: 2, maxLength: 120 },
        fullName: { type: "string", minLength: 2, maxLength: 160 },
        email: { type: "string", format: "email", maxLength: 160 },
        phone: { type: "string", maxLength: 40 },
        company: { type: "string", maxLength: 160 },
        taxId: { type: "string", maxLength: 80 },
        role: { type: "string", maxLength: 120 },
        city: { type: "string", maxLength: 120 },
        message: { type: "string", minLength: 4, maxLength: 1200 },
        preferredContact: { enum: ["email", "whatsapp", "phone"] },
        dataProcessingConsent: { const: true },
        commercialConsent: { type: "boolean" },
        emailConsent: { type: "boolean" },
        whatsappConsent: { type: "boolean" },
        entryRoute: { type: "string", maxLength: 240 },
      },
      [
        "audience",
        "need",
        "fullName",
        "email",
        "message",
        "preferredContact",
        "dataProcessingConsent",
        "entryRoute",
      ],
    ),
    outputSchema: objectOutput("Created lead reference"),
    redactFields: ["email", "message"],
  }),
  update_lead: defineGovernedTool({
    name: "update_lead",
    description: "Update an existing lead with explicit optimistic concurrency.",
    permission: "crm.manage",
    applicationServiceMethod: "CrmService.updateLead",
    mutation: true,
    dataClassification: "PERSONAL",
    status: "REVIEW",
    inputSchema: mutationInput(
      {
        leadId: { type: "string", format: "uuid" },
        patch: { type: "object", additionalProperties: false },
        expectedUpdatedAt: { type: "string", format: "date-time" },
      },
      ["leadId", "patch", "expectedUpdatedAt"],
    ),
    outputSchema: objectOutput("Updated lead"),
    redactFields: ["patch"],
  }),
  list_opportunities: defineGovernedTool({
    name: "list_opportunities",
    description: "List opportunities with bounded search, filters and pagination.",
    permission: "crm.read",
    applicationServiceMethod: "CrmService.listOpportunities",
    mutation: false,
    dataClassification: "INTERNAL",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        search: { type: "string", maxLength: 120 },
        stage: { type: "string", maxLength: 50 },
        assignedUserId: { type: "string", format: "uuid" },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    outputSchema: objectOutput("Paginated opportunity list"),
  }),
  get_opportunity: defineGovernedTool({
    name: "get_opportunity",
    description: "Read one opportunity through the existing CRM service boundary.",
    permission: "crm.read",
    applicationServiceMethod: "CrmService.getOpportunity",
    mutation: false,
    dataClassification: "INTERNAL",
    inputSchema: idInput("opportunityId"),
    outputSchema: objectOutput("Opportunity"),
  }),
  update_opportunity_stage: defineGovernedTool({
    name: "update_opportunity_stage",
    description: "Move an opportunity stage with confirmation, idempotency and optimistic concurrency.",
    permission: "crm.manage",
    applicationServiceMethod: "CrmService.changeStage",
    mutation: true,
    dataClassification: "INTERNAL",
    confirmationRequired: true,
    inputSchema: mutationInput(
      {
        opportunityId: { type: "string", format: "uuid" },
        stage: { type: "string", maxLength: 50 },
        note: { type: "string", maxLength: 2000 },
        expectedUpdatedAt: { type: "string", format: "date-time" },
      },
      ["opportunityId", "stage", "expectedUpdatedAt"],
    ),
    outputSchema: objectOutput("Updated opportunity or explicit conflict"),
  }),
  create_activity: defineGovernedTool({
    name: "create_activity",
    description: "Create a CRM activity through the existing scheduling workflow.",
    permission: "crm.manage",
    applicationServiceMethod: "CrmService.scheduleActivity",
    mutation: true,
    dataClassification: "INTERNAL",
    inputSchema: mutationInput(
      {
        opportunityId: { type: "string", format: "uuid" },
        type: { enum: ["CALL", "MEETING", "EMAIL", "TASK"] },
        note: { type: "string", maxLength: 2000 },
        dueDate: { type: "string", format: "date-time" },
      },
      ["opportunityId", "type"],
    ),
    outputSchema: objectOutput("Created activity"),
  }),
  complete_activity: defineGovernedTool({
    name: "complete_activity",
    description: "Complete a CRM activity with replay-safe idempotency.",
    permission: "crm.manage",
    applicationServiceMethod: "CrmService.completeActivity",
    mutation: true,
    dataClassification: "INTERNAL",
    inputSchema: mutationInput({ activityId: { type: "string", format: "uuid" } }, ["activityId"]),
    outputSchema: objectOutput("Completed activity or safe replay"),
  }),
  get_company: defineGovernedTool({
    name: "get_company",
    description: "Read one company with aggregate counts through CompaniesService.",
    permission: "companies.read",
    applicationServiceMethod: "CompaniesService.findById",
    mutation: false,
    dataClassification: "INTERNAL",
    inputSchema: idInput("companyId"),
    outputSchema: objectOutput("Company with aggregate counts"),
  }),
  get_partner: defineGovernedTool({
    name: "get_partner",
    description: "Read one business partner through the existing PartnersService.",
    permission: "partners.manage",
    applicationServiceMethod: "PartnersService.findById",
    mutation: false,
    dataClassification: "INTERNAL",
    inputSchema: idInput("partnerId"),
    outputSchema: objectOutput("Business partner"),
  }),
  create_followup: defineGovernedTool({
    name: "create_followup",
    description: "Create an assigned follow-up task in the existing CRM activity timeline.",
    permission: "crm.manage",
    applicationServiceMethod: "CrmService.scheduleActivity",
    mutation: true,
    dataClassification: "INTERNAL",
    inputSchema: mutationInput(
      {
        opportunityId: { type: "string", format: "uuid" },
        dueDate: { type: "string", format: "date-time" },
        note: { type: "string", minLength: 1, maxLength: 2000 },
        assignedUserId: { type: "string", format: "uuid" },
      },
      ["opportunityId", "dueDate", "note"],
    ),
    outputSchema: objectOutput("Created TASK activity"),
  }),
};
