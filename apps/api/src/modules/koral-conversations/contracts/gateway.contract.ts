export const KORAL_GATEWAY_CONTRACT_VERSION = "1.0.0" as const;

export interface GatewayRequestContext {
  version: typeof KORAL_GATEWAY_CONTRACT_VERSION;
  conversationId: string;
  correlationId: string;
  actorType: "KORAL" | "HUMAN_AGENT" | "SYSTEM";
  actorId?: string;
  permissions: string[];
  consentPurposeKeys: string[];
  piiPolicy: "DENY" | "MINIMIZE" | "ALLOW_SCOPED";
}

export interface AiGatewayInput {
  context: GatewayRequestContext;
  agentProfileKey: string;
  task: { kind: string; objective: string };
  messages: Array<{ role: "SYSTEM" | "USER" | "ASSISTANT"; content: string }>;
  responseSchema: Record<string, unknown>;
  budget: { maxInputTokens: number; maxOutputTokens: number; maxCostUsdMicros: number };
}

export type AiGatewayResult =
  | { ok: true; output: unknown; modelRef: string; usage: { inputTokens: number; outputTokens: number; costUsdMicros: number } }
  | { ok: false; code: "POLICY_DENIED" | "BUDGET_EXCEEDED" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "INVALID_RESPONSE"; retryable: boolean };

export interface AiGateway {
  infer(input: AiGatewayInput): Promise<AiGatewayResult>;
}

export interface ToolGatewayInput {
  context: GatewayRequestContext;
  toolKey: string;
  input: unknown;
  idempotencyKey?: string;
}

export type ToolGatewayResult =
  | { ok: true; output: unknown; auditReference: string }
  | { ok: false; code: "TOOL_NOT_FOUND" | "PERMISSION_DENIED" | "CONSENT_REQUIRED" | "STEP_UP_REQUIRED" | "VALIDATION_FAILED" | "CONFLICT" | "RATE_LIMITED" | "TOOL_UNAVAILABLE"; retryable: boolean };

export interface ToolGateway {
  execute(input: ToolGatewayInput): Promise<ToolGatewayResult>;
}

export interface KnowledgeGatewayInput {
  context: GatewayRequestContext;
  query: string;
  collectionKeys: string[];
  limit: number;
}

export type KnowledgeGatewayResult =
  | { ok: true; passages: Array<{ reference: string; content: string; score: number; classification: string }> }
  | { ok: false; code: "PERMISSION_DENIED" | "COLLECTION_NOT_FOUND" | "QUERY_REJECTED" | "KNOWLEDGE_UNAVAILABLE"; retryable: boolean };

export interface KnowledgeGateway {
  retrieve(input: KnowledgeGatewayInput): Promise<KnowledgeGatewayResult>;
}

/** Dependency contract for Agent 2; this module provides no provider/model implementation. */
export const GATEWAY_CONTRACT_SEMANTICS = {
  version: KORAL_GATEWAY_CONTRACT_VERSION,
  permissions: "Every request carries explicit effective permissions, consent purposes and PII policy.",
  audit: "Gateway implementations must return auditable references/usage while excluding prompts, secrets and raw PII from logs.",
  idempotency: "Tool mutations require an idempotencyKey; inference and read-only retrieval do not imply mutation replay safety.",
  errors: ["POLICY_DENIED", "PERMISSION_DENIED", "CONSENT_REQUIRED", "STEP_UP_REQUIRED", "RATE_LIMITED", "UNAVAILABLE"],
} as const;
