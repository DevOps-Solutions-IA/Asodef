import type { ConversationStatus } from "@prisma/client";
import type {
  DataClassification,
  GatewayRequestContext,
} from "@asodef/connect-contracts";
import type {
  KoralAiGatewayAdapter,
  KoralInferenceOutcome,
  KoralKnowledgeOutcome,
  KoralKnowledgeGatewayAdapter,
  KoralToolGatewayAdapter,
  KoralToolOutcome,
} from "./gateway.contract";
import type { ResolvedIdentityContext } from "./identity-resolution.contract";

export const KORAL_ORCHESTRATOR_CONTRACT_VERSION = "1.0.0" as const;

export interface ConversationContext {
  version: typeof KORAL_ORCHESTRATOR_CONTRACT_VERSION;
  conversationId: string;
  status: ConversationStatus;
  participantSummary: Array<{ kind: string; channel?: string }>;
  recentMessages: Array<{ id: string; direction: string; contentType: string; body?: string; occurredAt: Date }>;
  tags: string[];
  activeAssignmentUserId?: string;
}

export interface SafeConversationContext extends ConversationContext {
  identity: ResolvedIdentityContext;
  gatewayContext: GatewayRequestContext;
  dataClassification: DataClassification;
}

export interface OrchestrationAnalysis {
  intent: string;
  taskKind: string;
  confidence: number;
  requiresKnowledge: boolean;
  proposedToolKeys: string[];
  requiresHuman: boolean;
  reasonCodes: string[];
}

export interface OrchestrationDecision {
  version: typeof KORAL_ORCHESTRATOR_CONTRACT_VERSION;
  agentProfileKey?: string;
  analysis: OrchestrationAnalysis;
  action: "RESPOND" | "USE_KNOWLEDGE" | "REQUEST_TOOL" | "HANDOFF" | "WAIT";
  responsePolicyKeys: string[];
}

export interface ResponseValidationResult {
  valid: boolean;
  violations: string[];
  safeResponse?: string;
}

export interface KoralOrchestratorDependencies {
  aiGateway: KoralAiGatewayAdapter;
  toolGateway: KoralToolGatewayAdapter;
  knowledgeGateway: KoralKnowledgeGatewayAdapter;
}

export interface KoralOrchestrator {
  buildContext(conversationId: string): Promise<ConversationContext>;
  analyze(context: ConversationContext): Promise<OrchestrationAnalysis>;
  selectAgentProfile(context: ConversationContext, analysis: OrchestrationAnalysis): Promise<string>;
  evaluatePolicy(context: ConversationContext, analysis: OrchestrationAnalysis): Promise<OrchestrationDecision>;
  validateResponse(context: ConversationContext, candidate: unknown): Promise<ResponseValidationResult>;
}

export const KORAL_ORCHESTRATION_STEPS = [
  "RECEIVE_NORMALIZED_MESSAGE",
  "RESOLVE_CONVERSATION",
  "BUILD_SAFE_CONTEXT",
  "EVALUATE_AI_POLICY",
  "INVOKE_AI_GATEWAY",
  "RECEIVE_TOOL_REQUEST",
  "INVOKE_TOOL_GATEWAY",
  "RETURN_TOOL_RESULT",
  "CONTINUE_INFERENCE_IF_ALLOWED",
  "VALIDATE_OUTBOUND_RESPONSE",
  "HANDOFF_IF_REQUIRED",
  "APPEND_AUDIT_AND_CONVERSATION_EVENTS",
] as const;

export type KoralOrchestrationStep = (typeof KORAL_ORCHESTRATION_STEPS)[number];

export interface KoralOrchestrationRunInput {
  version: typeof KORAL_ORCHESTRATOR_CONTRACT_VERSION;
  normalizedMessageId: string;
  correlationId: string;
  deadlineAt: string;
}

export type KoralOrchestrationRunResult =
  | { kind: "RESPONDED"; conversationId: string; outboundMessageId: string; completedSteps: readonly KoralOrchestrationStep[] }
  | { kind: "HANDED_OFF"; conversationId: string; reasonCodes: readonly string[]; completedSteps: readonly KoralOrchestrationStep[] }
  | { kind: "WAITING"; conversationId: string; reasonCodes: readonly string[]; completedSteps: readonly KoralOrchestrationStep[] }
  | { kind: "REJECTED"; conversationId?: string; reasonCode: string; completedSteps: readonly KoralOrchestrationStep[] };

/** Execution contract only. Implementations must keep every business/data
 * access behind the canonical gateways and existing application services. */
export interface KoralOrchestrationPipeline {
  receiveNormalizedMessage(input: KoralOrchestrationRunInput): Promise<string>;
  resolveConversation(normalizedMessageId: string, correlationId: string): Promise<string>;
  buildSafeContext(conversationId: string, correlationId: string, deadlineAt: string): Promise<SafeConversationContext>;
  evaluateAiPolicy(context: SafeConversationContext): Promise<OrchestrationDecision>;
  invokeAiGateway(context: SafeConversationContext, decision: OrchestrationDecision): Promise<KoralInferenceOutcome>;
  receiveToolRequest(outcome: KoralInferenceOutcome): Promise<readonly string[]>;
  invokeToolGateway(context: SafeConversationContext, toolCallId: string): Promise<KoralToolOutcome>;
  returnToolResult(conversationId: string, outcome: KoralToolOutcome): Promise<void>;
  continueInferenceIfAllowed(context: SafeConversationContext): Promise<KoralInferenceOutcome | undefined>;
  validateOutboundResponse(context: SafeConversationContext, candidate: KoralInferenceOutcome): Promise<ResponseValidationResult>;
  handoffIfRequired(context: SafeConversationContext, violations: readonly string[]): Promise<boolean>;
  appendAuditAndConversationEvents(conversationId: string, correlationId: string, gatewayReferences: readonly string[]): Promise<void>;
  retrieveKnowledge?(context: SafeConversationContext, query: string): Promise<KoralKnowledgeOutcome>;
  run(input: KoralOrchestrationRunInput): Promise<KoralOrchestrationRunResult>;
}

export const ORCHESTRATOR_CONTRACT_SEMANTICS = {
  version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
  permissions: "The orchestrator may request only gateway capabilities present in the explicit effective context.",
  audit: "Decisions, reason codes, selected profile and gateway references are auditable; hidden reasoning and credentials are not stored.",
  idempotency: "The orchestrator never executes mutations directly; ToolGateway owns mutation idempotency.",
  timeout: "The absolute deadline is propagated unchanged through every adapter; no step may extend it.",
  errors: ["POLICY_DENIED", "CONTEXT_UNAVAILABLE", "INVALID_RESPONSE", "HUMAN_HANDOFF_REQUIRED"],
} as const;
