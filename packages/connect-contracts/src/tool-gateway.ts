import { GATEWAY_CONTEXT_SCHEMA } from "./shared";
import type {
  ConnectContractVersion,
  DataClassification,
  GatewayError,
  GatewayRequestContext,
  GatewayTimeout,
  JsonSchema,
  MinimumIdentityLevel,
} from "./shared";

export const TOOL_STATUSES = [
  "PUBLISHED",
  "REVIEW",
  "DISABLED",
  "RETIRED",
] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export interface ToolErrorContract {
  code: string;
  description: string;
  retryable: boolean;
}

export type ToolIdempotencyContract =
  | { required: false; semantics: "READ_ONLY" }
  | {
      required: true;
      keyField: "idempotencyKey";
      scope: "ACTOR_OPERATION";
      replay: "RETURN_ORIGINAL_RESPONSE";
    };

export interface ToolAuditContract {
  event: string;
  recordActor: true;
  recordTarget: true;
  recordResult: true;
  redactFields: readonly string[];
}

export interface GovernedToolContract {
  name: string;
  version: `v${number}`;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  errors: readonly ToolErrorContract[];
  permission: string;
  minimumIdentityLevel: MinimumIdentityLevel;
  confirmationRequired: boolean;
  rateLimit: { policyKey: string; scope: "ACTOR_TOOL"; failClosed: true };
  idempotency: ToolIdempotencyContract;
  timeout: GatewayTimeout;
  audit: ToolAuditContract;
  dataClassification: DataClassification;
  status: ToolStatus;
  execution: {
    applicationServiceMethod: string;
    directDataAccess: false;
    ownershipAndTenantScope: "APPLICATION_SERVICE_ENFORCED";
  };
}

export interface ToolGatewayRequest {
  version: ConnectContractVersion;
  toolName: string;
  toolVersion: `v${number}`;
  input: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
  confirmationGranted: boolean;
  timeout?: GatewayTimeout;
}

export interface ToolGatewayResponse {
  version: ConnectContractVersion;
  data: unknown;
  meta: {
    correlationId: string;
    auditEventId?: string;
    replayed: boolean;
  };
}

export type ToolGatewayErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONFIRMATION_REQUIRED"
  | "CONSENT_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDENTITY_LEVEL_INSUFFICIENT"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "TOOL_NOT_PUBLISHED"
  | "TOOL_NOT_FOUND"
  | "TOOL_VERSION_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export type ToolGatewayError = GatewayError<ToolGatewayErrorCode>;

export type ToolGatewayResult =
  | { ok: true; response: ToolGatewayResponse }
  | { ok: false; error: ToolGatewayError };

export interface ToolGateway {
  invoke(
    request: ToolGatewayRequest,
    context: GatewayRequestContext,
  ): Promise<ToolGatewayResult>;
}

export const TOOL_GATEWAY_CONTRACT = Object.freeze({
  version: "v1",
  contextSchema: GATEWAY_CONTEXT_SCHEMA,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "version",
      "toolName",
      "toolVersion",
      "input",
      "confirmationGranted",
    ],
    properties: {
      version: { const: "v1" },
      toolName: { type: "string", minLength: 1, maxLength: 100 },
      toolVersion: { type: "string", pattern: "^v[1-9][0-9]*$" },
      input: { type: "object" },
      idempotencyKey: { type: "string", minLength: 16, maxLength: 128 },
      confirmationGranted: { type: "boolean" },
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
    "CONFIRMATION_REQUIRED",
    "CONSENT_REQUIRED",
    "IDEMPOTENCY_KEY_REQUIRED",
    "IDENTITY_LEVEL_INSUFFICIENT",
    "INVALID_INPUT",
    "RATE_LIMITED",
    "TIMEOUT",
    "TOOL_NOT_PUBLISHED",
    "TOOL_NOT_FOUND",
    "TOOL_VERSION_UNAVAILABLE",
    "UPSTREAM_ERROR",
  ] satisfies readonly ToolGatewayErrorCode[],
  permissions: "EFFECTIVE_ACTOR_RBAC_AND_TOOL_POLICY;FAIL_CLOSED",
  audit: "ACTOR_TARGET_RESULT_CORRELATION_AND_IDEMPOTENCY_REPLAY",
  idempotency: "PER_TOOL_CONTRACT;ACTOR_OPERATION_SCOPE_FOR_MUTATIONS",
  structuredOutput: "VALIDATE_INPUT_AND_OUTPUT_AGAINST_PUBLISHED_TOOL_SCHEMAS",
});
