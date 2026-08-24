export const CONNECT_CONTRACT_VERSION = "v1" as const;

export type ConnectContractVersion = typeof CONNECT_CONTRACT_VERSION;
export type JsonSchema = Readonly<Record<string, unknown>>;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface ContractError {
  code: string;
  retryable: boolean;
  description: string;
}

/** Publication-time audit requirements. This is contract metadata, not the
 * per-request GatewayAuditContext carried by an authenticated invocation. */
export interface ContractAuditSemantics {
  required: true;
  records: readonly string[];
  piiPolicy: "MINIMIZED_NO_CONTENT";
  correlationRequired: true;
}

/** Descriptive replay requirements for a public operation. Enforcement
 * remains in the owning application service or governed gateway. */
export interface ContractIdempotencySemantics {
  required: boolean;
  scope: string;
  duplicateBehavior: string;
  retention: string;
}

/** Portable schema fragments. They are data contracts, never executable
 * validators or arbitrary code. */
export interface ContractSchema {
  readonly [key: string]: unknown;
  readonly $id: string;
  readonly type: "object";
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, JsonObject>>;
  readonly additionalProperties: boolean;
}

export interface PublicContract<Input, Output> {
  readonly name: string;
  readonly version: `${number}.${number}.${number}`;
  readonly inputSchema: ContractSchema;
  readonly outputSchema: ContractSchema;
  readonly errors: readonly ContractError[];
  readonly permissions: readonly string[];
  readonly audit: ContractAuditSemantics;
  readonly idempotency: ContractIdempotencySemantics;
  /** Type witnesses give clients static types without serializing runtime
   * implementation into the public descriptor. */
  readonly _input?: Input;
  readonly _output?: Output;
}

export const MINIMIZED_AUDIT: ContractAuditSemantics = {
  required: true,
  records: [
    "actor/service identity",
    "decision",
    "result",
    "reason code",
    "correlationId",
  ],
  piiPolicy: "MINIMIZED_NO_CONTENT",
  correlationRequired: true,
};

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

export interface GatewayIdentityEvidence {
  authenticated: boolean;
  mfaVerified: boolean;
  stepUpVerified: boolean;
}

/** Maps explicit assurance evidence only. Channel-level VERIFIED, MATCHED or
 * CLAIMED states must not be treated as authentication or MFA evidence. */
export function resolveGatewayIdentityLevel(
  evidence: GatewayIdentityEvidence,
): MinimumIdentityLevel | null {
  if (!evidence.authenticated) return null;
  if (evidence.stepUpVerified) return "STEP_UP_VERIFIED";
  if (evidence.mfaVerified) return "MFA_VERIFIED";
  return "AUTHENTICATED";
}
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

export const GATEWAY_AUDIENCES = [
  "PUBLIC",
  "AUTHENTICATED_AFFILIATE",
  "COMPANY_PARTNER",
  "INTERNAL",
  "ADMIN_ONLY",
] as const;
export type GatewayAudience = (typeof GATEWAY_AUDIENCES)[number];

/** Effective data scope resolved by trusted server-side identity and
 * membership services. Browser input, prompts, model output and tool
 * arguments are never authorities for these fields. */
export interface GatewayEffectiveScope {
  authority: "SERVER_SIDE";
  tenantKey: "ASODEF";
  audience: GatewayAudience;
  organizationIds: readonly string[];
  affiliateSubjectId?: string;
  maximumDataClassification: DataClassification;
}

/** Shared orchestrator boundary. It deliberately carries neither credentials
 * nor persistence clients. A Koral identity never replaces the effective
 * actor whose permissions and audit attribution are enforced. */
export interface GatewayRequestContext {
  version: ConnectContractVersion;
  identity: GatewayIdentityContext;
  audit: GatewayAuditContext;
  policy: GatewayPolicyContext;
  /** Optional for compatibility with existing non-Knowledge gateways.
   * Knowledge retrieval requires it and fails closed when absent. */
  effectiveScope?: GatewayEffectiveScope;
  /** Immutable orchestration deadline. Adapters may shorten, never extend it. */
  deadlineAt: string;
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
  required: ["version", "identity", "audit", "policy", "deadlineAt"],
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
    effectiveScope: {
      type: "object",
      additionalProperties: false,
      required: [
        "authority",
        "tenantKey",
        "audience",
        "organizationIds",
        "maximumDataClassification",
      ],
      properties: {
        authority: { const: "SERVER_SIDE" },
        tenantKey: { const: "ASODEF" },
        audience: { enum: GATEWAY_AUDIENCES },
        organizationIds: {
          type: "array",
          maxItems: 100,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 100 },
        },
        affiliateSubjectId: { type: "string", minLength: 1, maxLength: 100 },
        maximumDataClassification: { enum: DATA_CLASSIFICATIONS },
      },
    },
    deadlineAt: { type: "string", format: "date-time" },
  },
});
