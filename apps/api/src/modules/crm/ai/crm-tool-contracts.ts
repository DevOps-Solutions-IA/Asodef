export type CrmToolName =
  | "search_leads" | "get_lead" | "create_lead" | "update_lead"
  | "list_opportunities" | "get_opportunity" | "update_opportunity_stage"
  | "create_activity" | "complete_activity" | "get_company" | "get_partner" | "create_followup";

export interface GovernedCrmToolContract {
  name: CrmToolName;
  permission: "crm.read" | "crm.manage" | "companies.read" | "partners.manage";
  serviceMethod: string;
  mutation: boolean;
  idempotency: "required" | "not_applicable";
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema: Readonly<Record<string, unknown>>;
}

const objectOutput = (entity: string) => ({ type: "object", required: ["data", "meta"], properties: { data: { type: "object", description: entity }, meta: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" } } } } });
const idInput = (field: string) => ({ type: "object", additionalProperties: false, required: [field], properties: { [field]: { type: "string", format: "uuid" } } });

/** Declarative only: no route, chatbot, SQL executor or privileged bypass is
 * registered here. A future agent gateway must authenticate first, enforce
 * the named permission and invoke the listed application service. */
export const CRM_TOOL_CONTRACTS: Readonly<Record<CrmToolName, GovernedCrmToolContract>> = {
  search_leads: { name: "search_leads", permission: "crm.read", serviceMethod: "CrmService.listLeads", mutation: false, idempotency: "not_applicable", inputSchema: { type: "object", additionalProperties: false, properties: { search: { type: "string", maxLength: 120 }, status: { type: "string", maxLength: 50 }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 } } }, outputSchema: objectOutput("Paginated lead list") },
  get_lead: { name: "get_lead", permission: "crm.read", serviceMethod: "CrmService.getLead", mutation: false, idempotency: "not_applicable", inputSchema: idInput("leadId"), outputSchema: objectOutput("Lead") },
  create_lead: { name: "create_lead", permission: "crm.manage", serviceMethod: "LeadsService.createGuided", mutation: true, idempotency: "required", inputSchema: { type: "object", additionalProperties: false, required: ["fullName", "email", "message", "idempotencyKey"], properties: { fullName: { type: "string", maxLength: 120 }, email: { type: "string", format: "email", maxLength: 160 }, message: { type: "string", maxLength: 2000 }, idempotencyKey: { type: "string", minLength: 16, maxLength: 100 } } }, outputSchema: objectOutput("Created lead reference") },
  update_lead: { name: "update_lead", permission: "crm.manage", serviceMethod: "CrmService.updateLead", mutation: true, idempotency: "required", inputSchema: { ...idInput("leadId"), required: ["leadId", "patch", "expectedUpdatedAt", "idempotencyKey"], properties: { ...(idInput("leadId").properties as object), patch: { type: "object", additionalProperties: false }, expectedUpdatedAt: { type: "string", format: "date-time" }, idempotencyKey: { type: "string", minLength: 16, maxLength: 100 } } }, outputSchema: objectOutput("Updated lead") },
  list_opportunities: { name: "list_opportunities", permission: "crm.read", serviceMethod: "CrmService.listOpportunities", mutation: false, idempotency: "not_applicable", inputSchema: { type: "object", additionalProperties: false, properties: { search: { type: "string", maxLength: 120 }, stage: { type: "string" }, assignedUserId: { type: "string", format: "uuid" }, page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 } } }, outputSchema: objectOutput("Paginated opportunity list") },
  get_opportunity: { name: "get_opportunity", permission: "crm.read", serviceMethod: "CrmService.getOpportunity", mutation: false, idempotency: "not_applicable", inputSchema: idInput("opportunityId"), outputSchema: objectOutput("Opportunity") },
  update_opportunity_stage: { name: "update_opportunity_stage", permission: "crm.manage", serviceMethod: "CrmService.changeStage", mutation: true, idempotency: "required", inputSchema: { type: "object", additionalProperties: false, required: ["opportunityId", "stage", "expectedUpdatedAt", "idempotencyKey"], properties: { opportunityId: { type: "string", format: "uuid" }, stage: { type: "string" }, note: { type: "string", maxLength: 2000 }, expectedUpdatedAt: { type: "string", format: "date-time" }, idempotencyKey: { type: "string", minLength: 16, maxLength: 100 } } }, outputSchema: objectOutput("Updated opportunity or explicit conflict") },
  create_activity: { name: "create_activity", permission: "crm.manage", serviceMethod: "CrmService.scheduleActivity", mutation: true, idempotency: "required", inputSchema: { type: "object", additionalProperties: false, required: ["opportunityId", "type", "idempotencyKey"], properties: { opportunityId: { type: "string", format: "uuid" }, type: { enum: ["CALL", "MEETING", "EMAIL", "TASK"] }, note: { type: "string", maxLength: 2000 }, dueDate: { type: "string", format: "date-time" }, idempotencyKey: { type: "string", minLength: 16, maxLength: 100 } } }, outputSchema: objectOutput("Created activity") },
  complete_activity: { name: "complete_activity", permission: "crm.manage", serviceMethod: "CrmService.completeActivity", mutation: true, idempotency: "required", inputSchema: { type: "object", additionalProperties: false, required: ["activityId", "idempotencyKey"], properties: { activityId: { type: "string", format: "uuid" }, idempotencyKey: { type: "string", minLength: 16, maxLength: 100 } } }, outputSchema: objectOutput("Completed activity or safe replay") },
  get_company: { name: "get_company", permission: "companies.read", serviceMethod: "CompaniesService.findById", mutation: false, idempotency: "not_applicable", inputSchema: idInput("companyId"), outputSchema: objectOutput("Company with aggregate counts") },
  get_partner: { name: "get_partner", permission: "partners.manage", serviceMethod: "PartnersService.findById", mutation: false, idempotency: "not_applicable", inputSchema: idInput("partnerId"), outputSchema: objectOutput("Business partner") },
  create_followup: { name: "create_followup", permission: "crm.manage", serviceMethod: "CrmService.scheduleActivity", mutation: true, idempotency: "required", inputSchema: { type: "object", additionalProperties: false, required: ["opportunityId", "dueDate", "note", "idempotencyKey"], properties: { opportunityId: { type: "string", format: "uuid" }, dueDate: { type: "string", format: "date-time" }, note: { type: "string", minLength: 1, maxLength: 2000 }, assignedUserId: { type: "string", format: "uuid" }, idempotencyKey: { type: "string", minLength: 16, maxLength: 100 } } }, outputSchema: objectOutput("Created TASK activity") },
};
