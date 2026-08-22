import type { ConversationStatus } from "@prisma/client";
import type { AiGateway, KnowledgeGateway, ToolGateway } from "./gateway.contract";

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
  aiGateway: AiGateway;
  toolGateway: ToolGateway;
  knowledgeGateway: KnowledgeGateway;
}

export interface KoralOrchestrator {
  buildContext(conversationId: string): Promise<ConversationContext>;
  analyze(context: ConversationContext): Promise<OrchestrationAnalysis>;
  selectAgentProfile(context: ConversationContext, analysis: OrchestrationAnalysis): Promise<string>;
  evaluatePolicy(context: ConversationContext, analysis: OrchestrationAnalysis): Promise<OrchestrationDecision>;
  validateResponse(context: ConversationContext, candidate: unknown): Promise<ResponseValidationResult>;
}

export const ORCHESTRATOR_CONTRACT_SEMANTICS = {
  version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
  permissions: "The orchestrator may request only gateway capabilities present in the explicit effective context.",
  audit: "Decisions, reason codes, selected profile and gateway references are auditable; hidden reasoning and credentials are not stored.",
  idempotency: "The orchestrator never executes mutations directly; ToolGateway owns mutation idempotency.",
  errors: ["POLICY_DENIED", "CONTEXT_UNAVAILABLE", "INVALID_RESPONSE", "HUMAN_HANDOFF_REQUIRED"],
} as const;
