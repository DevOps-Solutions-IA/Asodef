import { GATEWAY_CONTEXT_SCHEMA } from "./shared";
import type {
  ConnectContractVersion,
  GatewayError,
  GatewayRequestContext,
  GatewayTimeout,
  JsonSchema,
} from "./shared";
import type { GovernedToolContract } from "./tool-gateway";

export type ConfigurationStatus =
  "DRAFT" | "REVIEW" | "PUBLISHED" | "RETIRED" | "ROLLED_BACK";

export type AiErrorCode =
  | "AUTHORIZATION_DENIED"
  | "BUDGET_EXCEEDED"
  | "DATA_CLASSIFICATION_DENIED"
  | "INVALID_REQUEST"
  | "MODEL_NOT_AVAILABLE"
  | "OUTPUT_SCHEMA_VIOLATION"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "TOOL_POLICY_DENIED";

export type AiContractError = GatewayError<AiErrorCode>;

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: number;
}

export interface AiGatewayRequest {
  version: ConnectContractVersion;
  modelProfileId: string;
  task?: string;
  messages: readonly {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
  }[];
  maxOutputTokens?: number;
  outputSchema?: JsonSchema;
  tools?: readonly GovernedToolContract[];
  timeout?: GatewayTimeout;
}

export interface AiGatewayResponse {
  version: ConnectContractVersion;
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

export type AiGatewayResult =
  | { ok: true; response: AiGatewayResponse }
  | { ok: false; error: AiContractError };

export interface AiGateway {
  infer(
    request: AiGatewayRequest,
    context: GatewayRequestContext,
  ): Promise<AiGatewayResult>;
}

export const AI_GATEWAY_CONTRACT = Object.freeze({
  version: "v1",
  contextSchema: GATEWAY_CONTEXT_SCHEMA,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["version", "modelProfileId", "messages"],
    properties: {
      version: { const: "v1" },
      modelProfileId: { type: "string", minLength: 1, maxLength: 100 },
      task: { type: "string", minLength: 1, maxLength: 500 },
      messages: { type: "array", minItems: 1, maxItems: 100 },
      maxOutputTokens: { type: "integer", minimum: 1 },
      outputSchema: { type: "object" },
      tools: { type: "array", maxItems: 32 },
      timeout: { type: "object" },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      response: { type: "object" },
      error: { type: "object" },
    },
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
    "TIMEOUT",
    "TOOL_POLICY_DENIED",
  ] satisfies readonly AiErrorCode[],
  structuredOutput: "VALIDATE_AGAINST_REQUEST_SCHEMA_OR_FAIL",
  errorDelivery:
    "DISCRIMINATED_RESULT;NO_PROVIDER_ERROR_OBJECT_CROSSES_BOUNDARY",
  permissions: "EFFECTIVE_ACTOR_RBAC_INTERSECTED_WITH_MODEL_AND_TOOL_POLICY",
  audit:
    "ACTOR_PROFILE_MODEL_USAGE_COST_AND_RESULT;PROMPT_CONTENT_EXCLUDED_BY_DEFAULT",
  idempotency:
    "INFERENCE_HAS_NO_BUSINESS_SIDE_EFFECT;TOOLS_ENFORCE_INDEPENDENT_IDEMPOTENCY",
});
