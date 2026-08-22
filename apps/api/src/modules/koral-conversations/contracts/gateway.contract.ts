import type { ResolvedIdentityContext } from "./identity-resolution.contract";

export const KORAL_GATEWAY_ADAPTER_VERSION = "1.0.0" as const;

/**
 * Minimal structural boundary implemented by the canonical Agent 2 gateway.
 * Koral deliberately does not redeclare its request, response, model, tool,
 * knowledge, classification, error or policy contracts.
 */
export interface CanonicalAiGatewayPort<TRequest, TContext, TResponse> {
  infer(request: TRequest, context: TContext): Promise<TResponse>;
}

export interface CanonicalToolGatewayPort<TRequest, TContext, TResponse> {
  invoke(request: TRequest, context: TContext): Promise<TResponse>;
}

export interface KoralGatewayAuditContext {
  conversationId: string;
  correlationId: string;
  identityId: string;
  actorId?: string;
  purpose: string;
}

export interface KoralGatewayInvocationContext<TDataClassification = unknown> {
  version: typeof KORAL_GATEWAY_ADAPTER_VERSION;
  audit: KoralGatewayAuditContext;
  identity: ResolvedIdentityContext;
  permissions: readonly string[];
  dataClassification: TDataClassification;
  consentVerified: boolean;
  deadlineAt: string;
}

export interface KoralInferenceRequest {
  agentProfileKey: string;
  messages: readonly { role: "system" | "user" | "assistant" | "tool"; content: string }[];
  responseSchema?: Readonly<Record<string, unknown>>;
  availableToolNames: readonly string[];
}

export type KoralInferenceOutcome =
  | {
      kind: "ASSISTANT_RESPONSE";
      content: string;
      structuredOutput?: unknown;
      gatewayCorrelationId: string;
      usageReference?: string;
    }
  | {
      kind: "TOOL_REQUEST";
      requests: readonly { callId: string; toolName: string; input: Readonly<Record<string, unknown>> }[];
      gatewayCorrelationId: string;
    }
  | { kind: "REJECTED"; reasonCode: string; retryable: boolean; gatewayCorrelationId?: string };

export interface KoralToolRequest {
  callId: string;
  toolName: string;
  toolVersion: `v${number}`;
  input: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
  confirmationGranted: boolean;
}

export type KoralToolOutcome =
  | { kind: "SUCCEEDED"; output: unknown; auditReference?: string; replayed: boolean; correlationId: string }
  | { kind: "REJECTED"; reasonCode: string; retryable: boolean; correlationId: string };

export interface KoralKnowledgeRequest {
  query: string;
  collectionKeys: readonly string[];
  limit: number;
}

export type KoralKnowledgeOutcome =
  | {
      kind: "FOUND";
      passages: readonly { reference: string; content: string; score: number; classification: unknown }[];
      correlationId: string;
    }
  | { kind: "REJECTED"; reasonCode: string; retryable: boolean; correlationId: string };

/** Consumer adapters own mapping only. Agent 2 remains owner of every
 * canonical gateway and governance contract behind these boundaries. */
export interface KoralAiGatewayAdapter<TDataClassification = unknown> {
  infer(
    request: KoralInferenceRequest,
    context: KoralGatewayInvocationContext<TDataClassification>,
  ): Promise<KoralInferenceOutcome>;
}

export interface KoralToolGatewayAdapter<TDataClassification = unknown> {
  invoke(
    request: KoralToolRequest,
    context: KoralGatewayInvocationContext<TDataClassification>,
  ): Promise<KoralToolOutcome>;
}

/** PR #20 owns knowledge lifecycle but does not yet expose a retrieval
 * gateway. This consumer port stays Koral-named until Agent 2 publishes one. */
export interface KoralKnowledgeResolver<TDataClassification = unknown> {
  retrieve(
    request: KoralKnowledgeRequest,
    context: KoralGatewayInvocationContext<TDataClassification>,
  ): Promise<KoralKnowledgeOutcome>;
}

export const KORAL_GATEWAY_ADAPTER_SEMANTICS = {
  version: KORAL_GATEWAY_ADAPTER_VERSION,
  inputSchema: "KORAL_NORMALIZED_INPUT;CANONICAL_MAPPING_REQUIRED",
  outputSchema: "KORAL_ORCHESTRATION_OUTCOME;CANONICAL_DETAILS_NOT_REDECLARED",
  errors: ["ADAPTER_REJECTED", "CANONICAL_GATEWAY_REJECTED", "DEADLINE_EXCEEDED", "INVALID_MAPPING"],
  permissions: "Adapters may only narrow the explicit effective permissions carried by Koral.",
  audit: "Correlation, identity, purpose and canonical audit references are retained; prompts, secrets and raw PII are not logged.",
  idempotency: "Tool idempotency is canonical Agent 2 policy; adapters preserve keys and never retry a mutation.",
  timeout: "Koral supplies an absolute deadline; adapters must fail closed after it and never extend it.",
} as const;
