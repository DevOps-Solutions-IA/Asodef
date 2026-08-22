export type JsonSchema = Readonly<Record<string, unknown>>;

export type ConfigurationStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED" | "ROLLED_BACK";

export type AiErrorCode =
  | "AUTHORIZATION_DENIED"
  | "BUDGET_EXCEEDED"
  | "DATA_CLASSIFICATION_DENIED"
  | "INVALID_REQUEST"
  | "MODEL_NOT_AVAILABLE"
  | "OUTPUT_SCHEMA_VIOLATION"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "TOOL_POLICY_DENIED";

export interface AiContractError {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: number;
}

export interface AiInvocationContext {
  actorId: string;
  permissions: readonly string[];
  identityLevel: "AUTHENTICATED" | "MFA_VERIFIED" | "STEP_UP_VERIFIED";
  correlationId: string;
  purpose: string;
  dataClassification: import("./data-classification").DataClassification;
  consentVerified?: boolean;
  confirmedToolNames?: readonly string[];
}

export interface AiGatewayRequest {
  version: "v1";
  modelProfileId: string;
  messages: readonly {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }[];
  maxOutputTokens?: number;
  outputSchema?: JsonSchema;
  tools?: readonly import("./tool-gateway.types").GovernedToolContract[];
}

export interface AiGatewayResponse {
  version: "v1";
  provider: string;
  model: string;
  content: string;
  structuredOutput?: unknown;
  toolCalls: readonly {
    id: string;
    name: string;
    arguments: Readonly<Record<string, unknown>>;
  }[];
  usage: AiUsage;
  correlationId: string;
}

/** Stable boundary consumed by Koral. Provider credentials are deliberately
 * absent from both the request and the context. */
export interface AiGateway {
  infer(request: AiGatewayRequest, context: AiInvocationContext): Promise<AiGatewayResponse>;
}

export const AI_GATEWAY_CONTRACT = Object.freeze({
  version: "v1",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["version", "modelProfileId", "messages"],
    properties: {
      version: { const: "v1" },
      modelProfileId: { type: "string", minLength: 1, maxLength: 100 },
      messages: { type: "array", minItems: 1, maxItems: 100 },
      maxOutputTokens: { type: "integer", minimum: 1 },
      outputSchema: { type: "object" },
      tools: { type: "array", maxItems: 32 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["version", "provider", "model", "content", "toolCalls", "usage", "correlationId"],
  },
  errors: [
    "AUTHORIZATION_DENIED",
    "BUDGET_EXCEEDED",
    "DATA_CLASSIFICATION_DENIED",
    "INVALID_REQUEST",
    "MODEL_NOT_AVAILABLE",
    "OUTPUT_SCHEMA_VIOLATION",
    "PROVIDER_ERROR",
    "RATE_LIMITED",
    "TOOL_POLICY_DENIED",
  ] satisfies readonly AiErrorCode[],
  permissions: { semantics: "MODEL_PROFILE_AND_TOOL_PERMISSION_INTERSECTION" },
  audit: {
    event: "ai.gateway.inference",
    recordActor: true,
    recordModelProfileVersion: true,
    recordUsageAndCost: true,
    retainPrompt: false,
  },
  idempotency: {
    required: false,
    semantics: "INFERENCE_HAS_NO_BUSINESS_SIDE_EFFECTS;TOOLS_HAVE_INDEPENDENT_IDEMPOTENCY",
  },
});
