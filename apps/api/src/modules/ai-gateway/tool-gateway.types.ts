import type { ConfigurationStatus, JsonSchema } from "./ai-contracts";
import type { DataClassification } from "./data-classification";

export type MinimumIdentityLevel = "AUTHENTICATED" | "MFA_VERIFIED" | "STEP_UP_VERIFIED";

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
  timeout: { milliseconds: number; maxAttempts: 1 };
  audit: ToolAuditContract;
  dataClassification: DataClassification;
  status: ConfigurationStatus;
  execution: {
    applicationServiceMethod: string;
    directDataAccess: false;
    ownershipAndTenantScope: "APPLICATION_SERVICE_ENFORCED";
  };
}

export interface ToolInvocationContext {
  actorId: string;
  permissions: readonly string[];
  identityLevel: MinimumIdentityLevel;
  correlationId: string;
  confirmationGranted: boolean;
  consentVerified: boolean;
  rateLimitAllowed: boolean;
  idempotencyKey?: string;
}

export interface ToolPolicyDecision {
  allowed: boolean;
  reason:
    | "ALLOWED"
    | "AUTHENTICATION_REQUIRED"
    | "CONFIRMATION_REQUIRED"
    | "CONSENT_REQUIRED"
    | "IDEMPOTENCY_KEY_REQUIRED"
    | "IDENTITY_LEVEL_INSUFFICIENT"
    | "PERMISSION_DENIED"
    | "RATE_LIMITED"
    | "TOOL_NOT_PUBLISHED";
}

export interface ToolGatewayRequest {
  version: "v1";
  toolName: string;
  toolVersion: `v${number}`;
  input: Readonly<Record<string, unknown>>;
}

export interface ToolGatewayResponse {
  version: "v1";
  data?: unknown;
  error?: ToolErrorContract;
  meta: {
    correlationId: string;
    auditEventId?: string;
    replayed: boolean;
  };
}

export interface ToolGateway {
  invoke(request: ToolGatewayRequest, context: ToolInvocationContext): Promise<ToolGatewayResponse>;
}
