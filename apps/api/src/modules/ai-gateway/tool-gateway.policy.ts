import type {
  GovernedToolContract,
  MinimumIdentityLevel,
  ToolInvocationContext,
  ToolPolicyDecision,
} from "./tool-gateway.types";

const IDENTITY_RANK: Readonly<Record<MinimumIdentityLevel, number>> = {
  AUTHENTICATED: 0,
  MFA_VERIFIED: 1,
  STEP_UP_VERIFIED: 2,
};

export class ToolGatewayPolicy {
  evaluate(
    contract: GovernedToolContract,
    context: ToolInvocationContext,
  ): ToolPolicyDecision {
    if (!context.identity.effectiveActorId)
      return { allowed: false, reason: "AUTHENTICATION_REQUIRED" };
    if (contract.status !== "PUBLISHED")
      return { allowed: false, reason: "TOOL_NOT_PUBLISHED" };
    if (!context.rateLimitAllowed)
      return { allowed: false, reason: "RATE_LIMITED" };
    if (!context.identity.permissions.includes(contract.permission))
      return { allowed: false, reason: "PERMISSION_DENIED" };
    if (
      IDENTITY_RANK[context.identity.identityLevel] <
      IDENTITY_RANK[contract.minimumIdentityLevel]
    ) {
      return { allowed: false, reason: "IDENTITY_LEVEL_INSUFFICIENT" };
    }
    if (contract.confirmationRequired && !context.confirmationGranted) {
      return { allowed: false, reason: "CONFIRMATION_REQUIRED" };
    }
    if (
      contract.dataClassification === "HIGHLY_SENSITIVE" &&
      !context.policy.consentVerified
    ) {
      return { allowed: false, reason: "CONSENT_REQUIRED" };
    }
    if (contract.idempotency.required && !context.idempotencyKey) {
      return { allowed: false, reason: "IDEMPOTENCY_KEY_REQUIRED" };
    }
    return { allowed: true, reason: "ALLOWED" };
  }
}
