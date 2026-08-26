import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { TOOL_DOMAIN_DEPENDENCIES, TOOL_GATEWAY_CATALOG } from "../ai-gateway/tool-catalog";
import { APPROVED_AGENT_MODEL_BINDINGS, APPROVED_MODEL_PROFILES } from "../ai-gateway/runtime-model-catalog";
import type {
  ControlPlaneWindow,
  KoralAgentView,
  KoralControlPlaneOverview,
  KoralRuntimeStatus,
  KoralRuntimeSummary,
} from "./koral-control-plane.types";

const DEFAULT_WINDOW_HOURS = 24 as const;

@Injectable()
export class KoralControlPlaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async overview(): Promise<KoralControlPlaneOverview> {
    const now = new Date();
    const from = new Date(now.getTime() - DEFAULT_WINDOW_HOURS * 60 * 60 * 1_000);
    const [
      conversationGroups,
      automationGroups,
      conversationEvents,
      knowledgeItems,
      knowledgeVersionGroups,
      eligiblePublished,
      automationExecutions,
      unresolvedDeadLetters,
      processingGroups,
      retrievalGroups,
      processingFailureGroups,
      processingLatency,
      recentActivity,
    ] = await Promise.all([
      this.prisma.conversation.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.connectAutomation.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.conversationEvent.count({ where: { createdAt: { gte: from, lte: now } } }),
      this.prisma.knowledgeItem.count(),
      this.prisma.knowledgeVersion.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.knowledgeVersion.count({
        where: {
          status: "PUBLISHED",
          audience: "PUBLIC",
          classification: "PUBLIC",
          language: "es",
          publicationSnapshot: { isNot: null },
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          ],
        },
      }),
      this.prisma.connectAutomationExecution.count(),
      this.prisma.connectAutomationDeadLetter.count({ where: { resolution: "UNRESOLVED" } }),
      this.prisma.webChatMessageProcessing.groupBy({ by: ["status"], where: { createdAt: { gte: from, lte: now } }, _count: { _all: true } }),
      this.prisma.knowledgeRetrievalAudit.groupBy({ by: ["result"], where: { createdAt: { gte: from, lte: now } }, _count: { _all: true } }),
      this.prisma.webChatMessageProcessing.groupBy({ by: ["failureCode"], where: { createdAt: { gte: from, lte: now }, failureCode: { not: null } }, _count: { _all: true } }),
      this.processingLatency(from, now),
      this.prisma.conversationEvent.findMany({
        where: { createdAt: { gte: from, lte: now } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
        select: { id: true, eventType: true, result: true, correlationId: true, createdAt: true },
      }),
    ]);
    const conversations = counts(conversationGroups);
    const automations = counts(automationGroups);
    const knowledgeVersions = counts(knowledgeVersionGroups);
    const runtime = this.runtimeSummary();
    const agents = this.agentViews(runtime.status);
    return {
      generatedAt: now.toISOString(),
      runtime: {
        ...runtime,
        agentProfiles: {
          total: agents.length,
          published: agents.filter(({ status }) => status === "PUBLISHED").length,
          configured: agents.filter(({ runtimeConfigured }) => runtimeConfigured).length,
        },
        toolGateway: { registered: false, executable: 0 },
      },
      conversations: {
        total: total(conversations),
        active: total(conversations) - (conversations.RESOLVED ?? 0) - (conversations.CLOSED ?? 0),
        aiActive: conversations.AI_ACTIVE ?? 0,
        humanRequired: conversations.HUMAN_REQUIRED ?? 0,
        humanActive: conversations.HUMAN_ACTIVE ?? 0,
        waitingUser: conversations.WAITING_USER ?? 0,
      },
      handoff: {
        pending: conversations.HUMAN_REQUIRED ?? 0,
        active: conversations.HUMAN_ACTIVE ?? 0,
      },
      knowledge: {
        items: knowledgeItems,
        versions: total(knowledgeVersions),
        byStatus: knowledgeVersions,
        published: knowledgeVersions.PUBLISHED ?? 0,
        eligiblePublished,
      },
      automations: {
        total: total(automations),
        active: automations.ACTIVE ?? 0,
        executions: automationExecutions,
        unresolvedDeadLetters,
        executionRuntime: "COMMUNICATION_SEND_ONLY",
      },
      telemetry: {
        windowHours: DEFAULT_WINDOW_HOURS,
        conversationEvents,
        processingByStatus: counts(processingGroups),
        retrievalByResult: counts(retrievalGroups, "result"),
        failuresByCode: nullableCounts(processingFailureGroups, "failureCode"),
        processingLatencyMs: processingLatency,
        aiUsagePersistence: "LOG_AND_REDIS_TTL",
        recentActivity: recentActivity.map((event) => ({
          ...event,
          correlationId: boundedNullableText(event.correlationId, 200),
          createdAt: event.createdAt.toISOString(),
        })),
      },
    };
  }

  async runtimeAgents() {
    const runtime = this.runtimeSummary();
    const knowledge = await this.knowledgeAvailability();
    return {
      generatedAt: new Date().toISOString(),
      runtime: {
        ...runtime,
        knowledgeGateway: { registered: true as const, ...knowledge },
        toolGateway: { registered: false as const, availability: "UNAVAILABLE" as const, executable: 0 as const },
      },
      agents: this.agentViews(runtime.status),
    };
  }

  tools() {
    const published = TOOL_GATEWAY_CATALOG.filter(({ status }) => status === "PUBLISHED").length;
    const review = TOOL_GATEWAY_CATALOG.filter(({ status }) => status === "REVIEW").length;
    return {
      generatedAt: new Date().toISOString(),
      runtime: { registered: false as const, reason: "TOOL_GATEWAY_UNAVAILABLE" as const },
      summary: { total: TOOL_GATEWAY_CATALOG.length, published, review, executable: 0 as const },
      dependencies: TOOL_DOMAIN_DEPENDENCIES,
      tools: TOOL_GATEWAY_CATALOG.map((tool) => ({
        name: tool.name,
        version: tool.version,
        status: tool.status,
        description: boundedText(tool.description, 1_000),
        purpose: "BUSINESS_APPLICATION_SERVICE" as const,
        mutation: "required" in tool.idempotency && tool.idempotency.required === true,
        permission: tool.permission,
        minimumIdentityLevel: tool.minimumIdentityLevel,
        confirmationRequired: tool.confirmationRequired,
        dataClassification: tool.dataClassification,
        applicationServiceMethod: tool.execution.applicationServiceMethod,
        inputSchema: sanitizeJson(tool.inputSchema),
        outputSchema: sanitizeJson(tool.outputSchema),
        runtimeExecutable: false as const,
      })),
    };
  }

  async automations(hours: number, limit: number) {
    const window = boundedWindow(hours);
    const [definitionGroups, executionGroups, unresolvedDeadLetters, definitions, executions] = await Promise.all([
      this.prisma.connectAutomation.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.connectAutomationExecution.groupBy({
        by: ["status"],
        where: { createdAt: { gte: new Date(window.from), lte: new Date(window.to) } },
        _count: { _all: true },
      }),
      this.prisma.connectAutomationDeadLetter.count({
        where: { resolution: "UNRESOLVED", createdAt: { gte: new Date(window.from), lte: new Date(window.to) } },
      }),
      this.prisma.connectAutomation.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit,
        include: { versions: { orderBy: { version: "desc" }, take: 20 } },
      }),
      this.prisma.connectAutomationExecution.findMany({
        where: { createdAt: { gte: new Date(window.from), lte: new Date(window.to) } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          automationVersion: { select: { version: true, automation: { select: { key: true } } } },
          steps: {
            orderBy: { actionIndex: "asc" },
            select: {
              id: true,
              actionIndex: true,
              actionType: true,
              status: true,
              attemptCount: true,
              nextAttemptAt: true,
              startedAt: true,
              finishedAt: true,
              failureCode: true,
              failureRetryable: true,
              retries: {
                orderBy: { attempt: "asc" },
                select: {
                  id: true,
                  attempt: true,
                  scheduledAt: true,
                  startedAt: true,
                  finishedAt: true,
                  failureCode: true,
                  retryable: true,
                },
              },
              deadLetter: {
                select: {
                  id: true,
                  reasonCode: true,
                  retryCount: true,
                  correlationId: true,
                  resolution: true,
                  resolvedBy: true,
                  resolvedAt: true,
                  createdAt: true,
                },
              },
            },
          },
          deadLetter: {
            select: {
              id: true,
              reasonCode: true,
              retryCount: true,
              correlationId: true,
              resolution: true,
              resolvedBy: true,
              resolvedAt: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    const definitionCounts = counts(definitionGroups);
    const executionCounts = counts(executionGroups);
    return {
      generatedAt: window.to,
      window,
      owner: "CONNECT_AUTOMATION" as const,
      koralIntegration: "NOT_REGISTERED" as const,
      supportedRuntimeActions: ["COMMUNICATION_SEND"] as const,
      unsupportedDefinitionActions: ["TOOL_CALL", "EMIT_EVENT"] as const,
      definitions: {
        total: total(definitionCounts),
        byStatus: definitionCounts,
        items: definitions.map((definition) => {
          const latest = definition.versions[0] ?? null;
          const current = definition.versions.find(({ status }) => status === "ACTIVE")
            ?? definition.versions.find(({ status }) => status === "PUBLISHED")
            ?? null;
          return {
            id: definition.id,
            key: definition.key,
            name: definition.name,
            status: definition.status,
            currentVersion: current ? automationVersion(current) : null,
            latestVersion: latest ? automationVersion(latest) : null,
          };
        }),
      },
      executions: {
        total: total(executionCounts),
        byStatus: executionCounts,
        unresolvedDeadLetters,
        items: executions.map((execution) => ({
          id: execution.id,
          automationKey: execution.automationVersion.automation.key,
          automationVersion: execution.automationVersion.version,
          status: execution.status,
          mode: execution.mode,
          triggerReference: boundedText(execution.triggerReference, 200),
          correlationId: boundedText(execution.correlationId, 200),
          causationId: boundedNullableText(execution.causationId, 200),
          requestedBy: boundedNullableText(execution.requestedBy, 200),
          startedAt: iso(execution.startedAt),
          finishedAt: iso(execution.finishedAt),
          failureCode: boundedNullableText(execution.failureCode, 160),
          failureRetryable: execution.failureRetryable,
          createdAt: execution.createdAt.toISOString(),
          updatedAt: execution.updatedAt.toISOString(),
          steps: execution.steps.map((step) => ({
            id: step.id,
            actionIndex: step.actionIndex,
            actionType: boundedText(step.actionType, 120),
            status: step.status,
            attemptCount: step.attemptCount,
            nextAttemptAt: iso(step.nextAttemptAt),
            startedAt: iso(step.startedAt),
            finishedAt: iso(step.finishedAt),
            failureCode: boundedNullableText(step.failureCode, 160),
            failureRetryable: step.failureRetryable,
            retries: step.retries.map((retry) => ({
              id: retry.id,
              attempt: retry.attempt,
              scheduledAt: retry.scheduledAt.toISOString(),
              startedAt: iso(retry.startedAt),
              finishedAt: iso(retry.finishedAt),
              failureCode: boundedNullableText(retry.failureCode, 160),
              retryable: retry.retryable,
            })),
            deadLetter: deadLetter(step.deadLetter),
          })),
          deadLetter: deadLetter(execution.deadLetter),
        })),
      },
    };
  }

  async analytics(hours: number) {
    const window = boundedWindow(hours);
    const range = { gte: new Date(window.from), lte: new Date(window.to) };
    const [
      conversationGroups,
      eventGroups,
      processingGroups,
      retrievalGroups,
      automationGroups,
      unresolvedDeadLetters,
      processingFailureGroups,
      processingLatency,
    ] = await Promise.all([
      this.prisma.conversation.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.conversationEvent.groupBy({ by: ["eventType"], where: { createdAt: range }, _count: { _all: true } }),
      this.prisma.webChatMessageProcessing.groupBy({ by: ["status"], where: { createdAt: range }, _count: { _all: true } }),
      this.prisma.knowledgeRetrievalAudit.groupBy({ by: ["result"], where: { createdAt: range }, _count: { _all: true } }),
      this.prisma.connectAutomationExecution.groupBy({ by: ["status"], where: { createdAt: range }, _count: { _all: true } }),
      this.prisma.connectAutomationDeadLetter.count({ where: { resolution: "UNRESOLVED", createdAt: range } }),
      this.prisma.webChatMessageProcessing.groupBy({ by: ["failureCode"], where: { createdAt: range, failureCode: { not: null } }, _count: { _all: true } }),
      this.processingLatency(range.gte, range.lte),
    ]);
    const conversationCounts = counts(conversationGroups);
    const eventCounts = counts(eventGroups, "eventType");
    const processingCounts = counts(processingGroups);
    const retrievalCounts = counts(retrievalGroups, "result");
    const automationCounts = counts(automationGroups);
    return {
      generatedAt: window.to,
      window,
      conversations: { total: total(conversationCounts), byStatus: conversationCounts },
      events: { total: total(eventCounts), byType: eventCounts },
      processing: {
        total: total(processingCounts),
        byStatus: processingCounts,
        failuresByCode: nullableCounts(processingFailureGroups, "failureCode"),
        latencyMs: processingLatency,
      },
      knowledgeRetrieval: { total: total(retrievalCounts), byResult: retrievalCounts },
      automations: {
        executions: { total: total(automationCounts), byStatus: automationCounts },
        unresolvedDeadLetters,
      },
      telemetry: {
        aiUsage: "STRUCTURED_LOG_AND_REDIS_DAILY_COUNTER" as const,
        durableAiInvocationStore: false as const,
        durableTokenCostStore: false as const,
        promptContentRecorded: false as const,
      },
    };
  }

  private runtimeSummary(): KoralRuntimeSummary {
    const aiRuntimeEnabled = this.config.get("AI_RUNTIME_ENABLED", { infer: true });
    const credentialPresent = this.config.get("OPENROUTER_API_KEY", { infer: true }).trim().length > 0;
    const baseUrlValid = validHttpsUrl(this.config.get("OPENROUTER_BASE_URL", { infer: true }));
    const providerConfigured = credentialPresent && baseUrlValid;
    const status: KoralRuntimeStatus = !aiRuntimeEnabled
      ? "DISABLED"
      : providerConfigured
        ? "CONFIGURED"
        : "MISCONFIGURED";
    return {
      status,
      aiRuntimeEnabled,
      provider: "openrouter",
      providerConfigured,
      providerPolicy: {
        timeoutMs: this.config.get("OPENROUTER_TIMEOUT_MS", { infer: true }),
        maxAttempts: this.config.get("OPENROUTER_MAX_ATTEMPTS", { infer: true }),
        circuitFailureThreshold: this.config.get("OPENROUTER_CIRCUIT_FAILURE_THRESHOLD", { infer: true }),
        circuitResetMs: this.config.get("OPENROUTER_CIRCUIT_RESET_MS", { infer: true }),
      },
    };
  }

  private async processingLatency(from: Date, to: Date): Promise<{ average: number; p95: number } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ average: number | null; p95: number | null }>>(Prisma.sql`
      SELECT
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)::float8 AS average,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)::float8 AS p95
      FROM web_chat_message_processings
      WHERE created_at >= ${from} AND created_at <= ${to} AND completed_at IS NOT NULL
    `);
    const row = rows[0];
    return row?.average !== null && row?.average !== undefined && row.p95 !== null
      ? { average: Math.round(row.average), p95: Math.round(row.p95) }
      : null;
  }

  private async knowledgeAvailability(): Promise<{ availability: "AVAILABLE" | "UNAVAILABLE"; publishedVersions: number | null }> {
    try {
      const publishedVersions = await this.prisma.knowledgeVersion.count({ where: { status: "PUBLISHED" } });
      return { availability: "AVAILABLE", publishedVersions };
    } catch {
      return { availability: "UNAVAILABLE", publishedVersions: null };
    }
  }

  private agentViews(runtimeStatus: KoralRuntimeStatus): KoralAgentView[] {
    return APPROVED_AGENT_MODEL_BINDINGS.map((binding) => {
      const profile = APPROVED_MODEL_PROFILES
        .filter(({ id }) => id === binding.modelProfileId)
        .sort((left, right) => right.version - left.version)[0];
      if (!profile) throw new Error(`MODEL_PROFILE_NOT_AVAILABLE:${binding.modelProfileId}`);
      const runtimeConfigured = runtimeStatus === "CONFIGURED" && profile.status === "PUBLISHED" && profile.enabled && profile.policyApproved;
      return {
        agentProfileKey: binding.agentProfileKey,
        modelProfileId: profile.id,
        name: profile.name,
        status: profile.status,
        version: profile.version,
        enabled: profile.enabled,
        policyApproved: profile.policyApproved,
        runtimeConfigured,
        primaryModel: profile.primaryModel,
        fallbackModels: profile.fallbackModels,
        allowedProviders: profile.allowedProviders,
        purpose: profile.purpose,
        maxInputTokens: profile.maxInputTokens,
        maxOutputTokens: profile.maxOutputTokens,
        structuredOutputRequired: profile.structuredOutputRequired,
        toolCallingAllowed: profile.toolCallingAllowed,
        dataClassificationPolicy: profile.dataClassificationPolicy,
        budgetPolicy: profile.budgetPolicy,
      };
    });
  }
}

function automationVersion(version: {
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
  publishedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: version.id,
    version: version.version,
    status: version.status,
    triggerType: version.triggerType,
    trigger: sanitizeJson(version.trigger),
    conditions: sanitizeJson(version.conditions),
    actions: sanitizeJson(version.actions),
    executionPolicy: sanitizeJson(version.executionPolicy),
    createdBy: boundedText(version.createdBy, 200),
    reviewedBy: boundedNullableText(version.reviewedBy, 200),
    publishedAt: iso(version.publishedAt),
    createdAt: version.createdAt.toISOString(),
  };
}

function deadLetter(value: {
  id: string;
  reasonCode: string;
  retryCount: number;
  correlationId: string;
  resolution: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
} | null) {
  return value ? {
    id: value.id,
    reasonCode: boundedText(value.reasonCode, 160),
    retryCount: value.retryCount,
    correlationId: boundedText(value.correlationId, 200),
    resolution: value.resolution,
    resolvedBy: boundedNullableText(value.resolvedBy, 200),
    resolvedAt: iso(value.resolvedAt),
    createdAt: value.createdAt.toISOString(),
  } : null;
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeJson(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, child]) => [
      key,
      /secret|password|token|credential|api[_-]?key|authorization|recipient|address|email|phone|body|content|prompt|literal|value/iu.test(key)
        ? "[REDACTED]"
        : sanitizeJson(child, depth + 1),
    ]));
  }
  return typeof value === "string" ? boundedText(value, 2_000) : value;
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
}

function boundedNullableText(value: string | null, maximum: number): string | null {
  return value === null ? null : boundedText(value, maximum);
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function boundedWindow(hours: number): ControlPlaneWindow {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1_000);
  return { hours, from: from.toISOString(), to: to.toISOString() };
}

function counts<T extends Record<string, unknown>>(rows: readonly T[], key: keyof T = "status"): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [String(row[key]), Number((row._count as { _all: number })._all)]));
}

function nullableCounts<T extends Record<string, unknown>>(rows: readonly T[], key: keyof T): Record<string, number> {
  return Object.fromEntries(rows.flatMap((row) => row[key] === null ? [] : [[String(row[key]), Number((row._count as { _all: number })._all)]]));
}

function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
