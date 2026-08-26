export type KoralRuntimeStatus = "CONFIGURED" | "DISABLED" | "MISCONFIGURED";

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
  knowledge: {
    items: number;
    versions: number;
    byStatus: Record<string, number>;
    published: number;
    eligiblePublished: number;
  };
  handoff: { pending: number; active: number };
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

export interface KoralAgentProfile {
  agentProfileKey: string;
  modelProfileId: string;
  name: string;
  status: string;
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
  dataClassificationPolicy: unknown;
  budgetPolicy: unknown;
}

export interface KoralAgentsResponse {
  generatedAt: string;
  runtime: KoralRuntimeSummary & {
    knowledgeGateway: {
      registered: true;
      availability: "AVAILABLE" | "UNAVAILABLE";
      publishedVersions: number | null;
    };
    toolGateway: {
      registered: false;
      availability: "UNAVAILABLE";
      executable: 0;
    };
  };
  agents: KoralAgentProfile[];
}

export interface KoralToolDependency {
  domain: string;
  status: string;
  reason: string;
  requiredContract: string;
}

export interface KoralGovernedTool {
  name: string;
  version: string;
  status: string;
  description: string;
  purpose: "BUSINESS_APPLICATION_SERVICE";
  mutation: boolean;
  permission: string;
  minimumIdentityLevel: string;
  confirmationRequired: boolean;
  dataClassification: string;
  applicationServiceMethod: string;
  inputSchema: unknown;
  outputSchema: unknown;
  runtimeExecutable: false;
}

export interface KoralToolsResponse {
  generatedAt: string;
  runtime: { registered: false; reason: "TOOL_GATEWAY_UNAVAILABLE" };
  summary: { total: number; published: number; review: number; executable: 0 };
  dependencies: KoralToolDependency[];
  tools: KoralGovernedTool[];
}

export interface KoralTimeWindow {
  hours: number;
  from: string;
  to: string;
}

export interface KoralAutomationsResponse {
  generatedAt: string;
  window: KoralTimeWindow;
  owner: "CONNECT_AUTOMATION";
  koralIntegration: "NOT_REGISTERED";
  supportedRuntimeActions: ["COMMUNICATION_SEND"];
  unsupportedDefinitionActions: ["TOOL_CALL", "EMIT_EVENT"];
  definitions: {
    total: number;
    byStatus: Record<string, number>;
    items: KoralAutomationDefinition[];
  };
  executions: {
    total: number;
    byStatus: Record<string, number>;
    unresolvedDeadLetters: number;
    items: KoralAutomationExecution[];
  };
}

export interface KoralAutomationDefinition {
  id: string;
  key: string;
  name: string;
  status: string;
  currentVersion: KoralAutomationVersion | null;
  latestVersion: KoralAutomationVersion | null;
}

export interface KoralAutomationVersion {
  id: string;
  version: number;
  status: string;
  triggerType: string;
  trigger: unknown;
  conditions: unknown;
  actions: unknown;
  executionPolicy: unknown;
  createdBy: string;
  reviewedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface KoralAutomationRetry {
  id: string;
  attempt: number;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  retryable: boolean | null;
}

export interface KoralAutomationDeadLetter {
  id: string;
  reasonCode: string;
  retryCount: number;
  correlationId: string;
  resolution: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface KoralAutomationStep {
  id: string;
  actionIndex: number;
  actionType: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  failureRetryable: boolean | null;
  retries: KoralAutomationRetry[];
  deadLetter: KoralAutomationDeadLetter | null;
}

export interface KoralAutomationExecution {
  id: string;
  automationKey: string;
  automationVersion: number;
  status: string;
  mode: string;
  triggerReference: string;
  correlationId: string;
  causationId: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  failureRetryable: boolean | null;
  createdAt: string;
  updatedAt: string;
  steps: KoralAutomationStep[];
  deadLetter: KoralAutomationDeadLetter | null;
}

export interface KoralAnalyticsResponse {
  generatedAt: string;
  window: KoralTimeWindow;
  conversations: { total: number; byStatus: Record<string, number> };
  events: { total: number; byType: Record<string, number> };
  processing: {
    total: number;
    byStatus: Record<string, number>;
    failuresByCode: Record<string, number>;
    latencyMs: { average: number; p95: number } | null;
  };
  knowledgeRetrieval: { total: number; byResult: Record<string, number> };
  automations: {
    executions: { total: number; byStatus: Record<string, number> };
    unresolvedDeadLetters: number;
  };
  telemetry: {
    aiUsage: "STRUCTURED_LOG_AND_REDIS_DAILY_COUNTER";
    durableAiInvocationStore: false;
    durableTokenCostStore: false;
    promptContentRecorded: false;
  };
}
