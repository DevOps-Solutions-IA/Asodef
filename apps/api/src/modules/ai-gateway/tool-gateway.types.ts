export {
  TOOL_GATEWAY_CONTRACT,
  TOOL_STATUSES,
  type GovernedToolContract,
  type MinimumIdentityLevel,
  type ToolAuditContract,
  type ToolErrorContract,
  type ToolGateway,
  type ToolGatewayError,
  type ToolGatewayErrorCode,
  type ToolGatewayRequest,
  type ToolGatewayResponse,
  type ToolGatewayResult,
  type ToolIdempotencyContract,
  type ToolStatus,
} from "@asodef/connect-contracts";

import type { GatewayRequestContext } from "@asodef/connect-contracts";

/** Runtime evidence evaluated in addition to the canonical identity, audit
 * and data-policy context. */
export interface ToolInvocationContext extends GatewayRequestContext {
  confirmationGranted: boolean;
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
