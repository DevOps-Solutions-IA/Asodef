import type {
  AiGatewayRequest,
  DataClassification,
  GatewayRequestContext,
  GatewayTimeout,
  GovernedToolContract,
  JsonSchema,
  KnowledgeGatewayRequest,
  ToolGatewayRequest,
} from "@asodef/connect-contracts";

export interface KoralInferenceRequest {
  agentProfileKey: string;
  task?: string;
  messages: AiGatewayRequest["messages"];
  responseSchema?: JsonSchema;
  availableTools?: readonly GovernedToolContract[];
  maxOutputTokens?: number;
  timeout?: GatewayTimeout;
}

/** Koral owns orchestration meaning; provider/model response contracts remain
 * exclusively owned by @asodef/connect-contracts. */
export type KoralInferenceOutcome =
  | {
      kind: "ASSISTANT_RESPONSE";
      content: string;
      structuredOutput?: unknown;
      gatewayCorrelationId: string;
    }
  | {
      kind: "TOOL_REQUEST";
      requests: readonly {
        callId: string;
        toolName: string;
        input: Readonly<Record<string, unknown>>;
      }[];
      gatewayCorrelationId: string;
    }
  | {
      kind: "REJECTED";
      reasonCode: string;
      retryable: boolean;
      gatewayCorrelationId?: string;
    };

export type KoralToolRequest = Omit<ToolGatewayRequest, "version">;

export type KoralToolOutcome =
  | {
      kind: "SUCCEEDED";
      output: unknown;
      auditReference?: string;
      replayed: boolean;
      correlationId: string;
    }
  | {
      kind: "REJECTED";
      reasonCode: string;
      retryable: boolean;
      correlationId: string;
    };

export type KoralKnowledgeRequest = Omit<KnowledgeGatewayRequest, "version">;

export type KoralKnowledgeOutcome =
  | {
      kind: "FOUND";
      passages: readonly {
        reference: string;
        content: string;
        score?: number;
        classification: DataClassification;
      }[];
      correlationId: string;
    }
  | {
      kind: "REJECTED";
      reasonCode: string;
      retryable: boolean;
      correlationId: string;
    };

export interface KoralAiGatewayAdapter {
  infer(
    request: KoralInferenceRequest,
    context: GatewayRequestContext,
  ): Promise<KoralInferenceOutcome>;
}

export interface KoralToolGatewayAdapter {
  invoke(
    request: KoralToolRequest,
    context: GatewayRequestContext,
  ): Promise<KoralToolOutcome>;
}

export interface KoralKnowledgeGatewayAdapter {
  search(
    request: KoralKnowledgeRequest,
    context: GatewayRequestContext,
  ): Promise<KoralKnowledgeOutcome>;
}

export const KORAL_GATEWAY_ADAPTER_SEMANTICS = {
  version: "v1",
  inputSchema: "KORAL_NORMALIZED_INPUT_TO_CANONICAL_CONNECT_CONTRACTS",
  outputSchema: "CANONICAL_RESULTS_TO_KORAL_ORCHESTRATION_OUTCOME",
  errors: [
    "CANONICAL_GATEWAY_REJECTED",
    "DEADLINE_EXCEEDED",
    "IDENTITY_EVIDENCE_REQUIRED",
    "MODEL_PROFILE_NOT_AVAILABLE",
  ],
  permissions:
    "Adapters pass only the effective permissions in GatewayRequestContext.",
  audit:
    "Canonical correlation and audit context is retained; prompts, secrets and raw PII are not logged.",
  idempotency:
    "ToolGateway owns idempotency; adapters preserve keys and never retry mutations.",
  timeout:
    "The canonical absolute deadline is propagated unchanged and never extended.",
} as const;
