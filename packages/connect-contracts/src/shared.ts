export const CONNECT_CONTRACT_VERSION = "v1" as const;

export type ConnectContractVersion = typeof CONNECT_CONTRACT_VERSION;
export type JsonSchema = Readonly<Record<string, unknown>>;

export const DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "PERSONAL",
  "SENSITIVE",
  "HIGHLY_SENSITIVE",
] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export type MinimumIdentityLevel =
  "AUTHENTICATED" | "MFA_VERIFIED" | "STEP_UP_VERIFIED";
export type GatewayPrincipalType = "KORAL" | "HUMAN_AGENT" | "SYSTEM";
export type GatewayPiiPolicy = "DENY" | "MINIMIZE" | "ALLOW_SCOPED";

export interface GatewayIdentityContext {
  principalType: GatewayPrincipalType;
  principalId: string;
  /** The authenticated human or service actor whose RBAC is enforced. */
  effectiveActorId: string;
  identityLevel: MinimumIdentityLevel;
  permissions: readonly string[];
}

export interface GatewayAuditContext {
  correlationId: string;
  conversationId?: string;
  requestId?: string;
  causationId?: string;
}

export interface GatewayPolicyContext {
  purpose: string;
  consentPurposeKeys: readonly string[];
  consentVerified: boolean;
  piiPolicy: GatewayPiiPolicy;
  dataClassification: DataClassification;
}

/** Shared orchestrator boundary. It deliberately carries neither credentials
 * nor persistence clients. A Koral identity never replaces the effective
 * actor whose permissions and audit attribution are enforced. */
export interface GatewayRequestContext {
  version: ConnectContractVersion;
  identity: GatewayIdentityContext;
  audit: GatewayAuditContext;
  policy: GatewayPolicyContext;
}

export interface GatewayError<TCode extends string = string> {
  code: TCode;
  message: string;
  retryable: boolean;
  correlationId: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface GatewayTimeout {
  milliseconds: number;
  maxAttempts: number;
}

export const GATEWAY_CONTEXT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["version", "identity", "audit", "policy"],
  properties: {
    version: { const: "v1" },
    identity: {
      type: "object",
      required: [
        "principalType",
        "principalId",
        "effectiveActorId",
        "identityLevel",
        "permissions",
      ],
    },
    audit: { type: "object", required: ["correlationId"] },
    policy: {
      type: "object",
      required: [
        "purpose",
        "consentPurposeKeys",
        "consentVerified",
        "piiPolicy",
        "dataClassification",
      ],
    },
  },
});
