import type { ModelProfile } from "../ai-gateway/model-registry";

export type KoralRuntimeStatus = "CONFIGURED" | "DISABLED" | "MISCONFIGURED";

export interface ControlPlaneWindow {
  hours: number;
  from: string;
  to: string;
}

export interface KoralRuntimeSummary {
  status: KoralRuntimeStatus;
  aiRuntimeEnabled: boolean;
  provider: "openrouter";
  providerConfigured: boolean;
  providerPolicy: {
    timeoutMs: number;
    maxAttempts: number;
    circuitFailureThreshold: number;
    circuitResetMs: number;
  };
}

export interface KoralAgentView {
  agentProfileKey: string;
  modelProfileId: string;
  name: string;
  status: ModelProfile["status"];
  version: number;
  enabled: boolean;
  policyApproved: boolean;
  runtimeConfigured: boolean;
  primaryModel: string;
  fallbackModels: readonly string[];
  allowedProviders: readonly string[];
  purpose: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  structuredOutputRequired: boolean;
  toolCallingAllowed: boolean;
  dataClassificationPolicy: ModelProfile["dataClassificationPolicy"];
  budgetPolicy: ModelProfile["budgetPolicy"];
}

export interface KoralControlPlaneOverview {
  generatedAt: string;
  runtime: KoralRuntimeSummary & {
    agentProfiles: { total: number; published: number; configured: number };
    toolGateway: { registered: false; executable: 0 };
  };
  conversations: {
    total: number;
    active: number;
    aiActive: number;
    humanRequired: number;
    humanActive: number;
    waitingUser: number;
  };
  handoff: { pending: number; active: number };
  knowledge: {
    items: number;
    versions: number;
    byStatus: Record<string, number>;
    published: number;
    eligiblePublished: number;
  };
  automations: {
    total: number;
    active: number;
    executions: number;
    unresolvedDeadLetters: number;
    executionRuntime: "COMMUNICATION_SEND_ONLY";
  };
  telemetry: {
    windowHours: 24;
    conversationEvents: number;
    processingByStatus: Record<string, number>;
    retrievalByResult: Record<string, number>;
    failuresByCode: Record<string, number>;
    processingLatencyMs: { average: number; p95: number } | null;
    aiUsagePersistence: "LOG_AND_REDIS_TTL";
    recentActivity: Array<{ id: string; eventType: string; result: string; correlationId: string | null; createdAt: string }>;
  };
}
