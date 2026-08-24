import { COMMUNICATIONS_SEND_TOOL_BINDING } from "@asodef/connect-contracts";
import { CRM_TOOL_CONTRACTS } from "../crm/ai/crm-tool-contracts";
import { defineGovernedTool } from "./tool-contract.factory";
import type { GovernedToolContract } from "./tool-gateway.types";

const listInput = {
  type: "object",
  additionalProperties: false,
  properties: {
    search: { type: "string", maxLength: 120 },
    status: { type: "string", maxLength: 50 },
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
  },
};

const idInput = (field: string) => ({
  type: "object",
  additionalProperties: false,
  required: [field],
  properties: { [field]: { type: "string", format: "uuid" } },
});

const structuredOutput = (description: string) => ({
  type: "object",
  additionalProperties: false,
  required: ["data", "meta"],
  properties: {
    data: { description },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["requestId"],
      properties: { requestId: { type: "string" } },
    },
  },
});

const BUSINESS_READ_TOOLS = [
  defineGovernedTool({
    name: "get_contract",
    description: "Read one contract through the existing ContractsService.",
    permission: "contracts.read",
    applicationServiceMethod: "ContractsService.getContract",
    mutation: false,
    dataClassification: "SENSITIVE",
    inputSchema: idInput("contractId"),
    outputSchema: structuredOutput("Contract detail"),
    redactFields: ["signers", "acceptances"],
  }),
  defineGovernedTool({
    name: "list_pqr_cases",
    description:
      "List PQR cases through the existing bounded administrative query.",
    permission: "pqr.manage",
    applicationServiceMethod: "PqrCasesService.list",
    mutation: false,
    dataClassification: "PERSONAL",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          enum: [
            "RECEIVED",
            "ASSIGNED",
            "IN_REVIEW",
            "INFORMATION_REQUIRED",
            "RESOLVED",
            "CLOSED",
            "REOPENED",
          ],
        },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    outputSchema: structuredOutput("Paginated PQR case list"),
    redactFields: ["requesterEmail", "description"],
  }),
  defineGovernedTool({
    name: "get_pqr_case",
    description: "Read one PQR case through the existing PqrCasesService.",
    permission: "pqr.manage",
    applicationServiceMethod: "PqrCasesService.findById",
    mutation: false,
    dataClassification: "PERSONAL",
    inputSchema: idInput("pqrCaseId"),
    outputSchema: structuredOutput("PQR case detail"),
    redactFields: ["requesterEmail", "description"],
  }),
  defineGovernedTool({
    name: "search_payment_orders",
    description:
      "Search payment orders read-only through the existing administrative service.",
    permission: "payments.read",
    applicationServiceMethod: "PaymentOrdersService.search",
    mutation: false,
    dataClassification: "SENSITIVE",
    inputSchema: {
      ...listInput,
      properties: {
        ...listInput.properties,
        status: {
          enum: [
            "DRAFT",
            "PENDING",
            "PROCESSING",
            "APPROVED",
            "REJECTED",
            "FAILED",
            "EXPIRED",
            "CANCELLED",
            "REFUNDED",
            "PARTIALLY_REFUNDED",
          ],
        },
      },
    },
    outputSchema: structuredOutput("Paginated payment order list"),
    redactFields: ["documentNumber", "customerEmail"],
  }),
  defineGovernedTool({
    name: "get_payment_order",
    description:
      "Read one payment order through the existing administrative service.",
    permission: "payments.read",
    applicationServiceMethod: "PaymentOrdersService.findByIdForAdmin",
    mutation: false,
    dataClassification: "SENSITIVE",
    inputSchema: idInput("paymentOrderId"),
    outputSchema: structuredOutput("Payment order detail"),
    redactFields: ["documentNumber", "customerEmail"],
  }),
  defineGovernedTool({
    name: "search_consent_records",
    description:
      "Search consent evidence through the existing administrative service.",
    permission: "data.manage",
    applicationServiceMethod: "ConsentService.search",
    mutation: false,
    dataClassification: "HIGHLY_SENSITIVE",
    minimumIdentityLevel: "STEP_UP_VERIFIED",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        subjectType: { enum: ["user", "leadSubmission", "customer"] },
        subjectId: { type: "string", format: "uuid" },
        purposeKey: { type: "string", maxLength: 120 },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    outputSchema: structuredOutput("Consent evidence list"),
    redactFields: ["subject", "ipAddress", "userAgent"],
  }),
  defineGovernedTool({
    name: "get_consent_record",
    description:
      "Read one consent evidence record through the existing ConsentService.",
    permission: "data.manage",
    applicationServiceMethod: "ConsentService.getDetail",
    mutation: false,
    dataClassification: "HIGHLY_SENSITIVE",
    minimumIdentityLevel: "STEP_UP_VERIFIED",
    inputSchema: idInput("consentRecordId"),
    outputSchema: structuredOutput("Consent evidence detail"),
    redactFields: ["subject", "ipAddress", "userAgent"],
  }),
  defineGovernedTool({
    name: "list_report_definitions",
    description:
      "List available report definitions without running or exporting a report.",
    permission: "reports.read",
    applicationServiceMethod: "ReportsService.listReports",
    mutation: false,
    dataClassification: "INTERNAL",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    outputSchema: structuredOutput("Report definition list"),
  }),
] as const;

export const TOOL_GATEWAY_CATALOG: readonly GovernedToolContract[] =
  Object.freeze([
    ...Object.values(CRM_TOOL_CONTRACTS),
    ...BUSINESS_READ_TOOLS,
    COMMUNICATIONS_SEND_TOOL_BINDING,
  ]);

export interface ToolDomainDependency {
  domain: "PLANS";
  status: "BLOCKED";
  reason: string;
  requiredContract: string;
}

/** Plans remains deliberately non-executable until an application-service
 * contract exists. */
export const TOOL_DOMAIN_DEPENDENCIES: readonly ToolDomainDependency[] =
  Object.freeze([
    {
      domain: "PLANS",
      status: "BLOCKED",
      reason:
        "No versioned Plans application-service contract exists in the current brownfield.",
      requiredContract:
        "Plans read contract with RBAC, classification and published lifecycle semantics.",
    },
  ]);
