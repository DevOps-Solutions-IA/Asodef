import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { PrismaService } from "../../database/prisma.service";
import { KoralControlPlaneService } from "./koral-control-plane.service";

describe("KoralControlPlaneService", () => {
  function harness(options?: { enabled?: boolean; credential?: string; baseUrl?: string }) {
    const prisma = {
      conversation: { groupBy: jest.fn().mockResolvedValue([{ status: "AI_ACTIVE", _count: { _all: 3 } }]) },
      conversationEvent: {
        count: jest.fn().mockResolvedValue(7),
        groupBy: jest.fn().mockResolvedValue([{ eventType: "KORAL_RESPONSE_SENT", _count: { _all: 2 } }]),
        findMany: jest.fn().mockResolvedValue([{ id: "event-1", eventType: "KORAL_RESPONSE_SENT", result: "SUCCESS", correlationId: "correlation-1", createdAt: new Date("2026-08-26T12:00:00.000Z") }]),
      },
      webChatMessageProcessing: { groupBy: jest.fn().mockResolvedValue([{ status: "COMPLETED", failureCode: "PROVIDER_UNAVAILABLE", _count: { _all: 2 } }]) },
      knowledgeItem: { count: jest.fn().mockResolvedValue(2) },
      knowledgeVersion: {
        groupBy: jest.fn().mockResolvedValue([{ status: "PUBLISHED", _count: { _all: 2 } }]),
        count: jest.fn().mockResolvedValue(2),
      },
      knowledgeRetrievalAudit: { groupBy: jest.fn().mockResolvedValue([{ result: "SUFFICIENT_EVIDENCE", _count: { _all: 2 } }]) },
      connectAutomation: {
        groupBy: jest.fn().mockResolvedValue([{ status: "ACTIVE", _count: { _all: 1 } }]),
        findMany: jest.fn().mockResolvedValue([{
          id: "automation-1", key: "welcome", name: "Welcome", status: "ACTIVE", updatedAt: new Date(),
          versions: [{
            id: "version-1", version: 1, status: "ACTIVE", triggerType: "EVENT",
            trigger: { eventType: "LEAD_CREATED", apiKey: "must-not-leak" },
            conditions: [], actions: [{ type: "COMMUNICATION_SEND", token: "must-not-leak" }],
            executionPolicy: { timeoutMs: 1_000 }, createdBy: "admin", reviewedBy: null,
            publishedAt: new Date("2026-08-26T12:00:00.000Z"), createdAt: new Date("2026-08-26T11:00:00.000Z"),
          }],
        }]),
      },
      connectAutomationExecution: {
        groupBy: jest.fn().mockResolvedValue([{ status: "FAILED", _count: { _all: 1 } }]),
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([{
          id: "execution-1", status: "FAILED", mode: "EVENT", triggerReference: "event-1",
          correlationId: "correlation-1", causationId: null, requestedBy: "test", startedAt: new Date("2026-08-26T12:00:00.000Z"),
          finishedAt: new Date("2026-08-26T12:00:01.000Z"), failureCode: "PROVIDER_ERROR", failureRetryable: true,
          createdAt: new Date("2026-08-26T12:00:00.000Z"), updatedAt: new Date("2026-08-26T12:00:01.000Z"),
          automationVersion: { version: 1, automation: { key: "welcome" } },
          steps: [{
            id: "step-1", actionIndex: 0, actionType: "COMMUNICATION_SEND", status: "RETRY_PENDING", attemptCount: 1,
            nextAttemptAt: new Date("2026-08-26T12:01:00.000Z"), startedAt: new Date("2026-08-26T12:00:00.000Z"),
            finishedAt: new Date("2026-08-26T12:00:01.000Z"), failureCode: "PROVIDER_ERROR", failureRetryable: true,
            retries: [{ id: "retry-1", attempt: 1, scheduledAt: new Date("2026-08-26T12:00:00.000Z"), startedAt: null, finishedAt: null, failureCode: null, retryable: null }],
            deadLetter: null,
          }],
          deadLetter: null,
        }]),
      },
      connectAutomationDeadLetter: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([{ average: 25, p95: 40 }]),
    };
    const env = {
      AI_RUNTIME_ENABLED: options?.enabled ?? true,
      OPENROUTER_API_KEY: options?.credential ?? "provider-secret",
      OPENROUTER_BASE_URL: options?.baseUrl ?? "https://openrouter.example.test/api/v1",
      OPENROUTER_TIMEOUT_MS: 10_000,
      OPENROUTER_MAX_ATTEMPTS: 2,
      OPENROUTER_CIRCUIT_FAILURE_THRESHOLD: 5,
      OPENROUTER_CIRCUIT_RESET_MS: 30_000,
    };
    const config = { get: jest.fn((key: keyof typeof env) => env[key]) };
    return {
      service: new KoralControlPlaneService(
        prisma as unknown as PrismaService,
        config as unknown as ConfigService<EnvConfig, true>,
      ),
      prisma,
    };
  }

  it("reports static runtime truth without exposing provider credentials", async () => {
    const { service } = harness();
    const result = await service.runtimeAgents();
    expect(result.runtime).toEqual(expect.objectContaining({
      status: "CONFIGURED",
      aiRuntimeEnabled: true,
      provider: "openrouter",
      providerConfigured: true,
      providerPolicy: { timeoutMs: 10_000, maxAttempts: 2, circuitFailureThreshold: 5, circuitResetMs: 30_000 },
      knowledgeGateway: { registered: true, availability: "AVAILABLE", publishedVersions: 2 },
      toolGateway: { registered: false, availability: "UNAVAILABLE", executable: 0 },
    }));
    expect(result.agents).toEqual([expect.objectContaining({ agentProfileKey: "koral.crm-assistant", runtimeConfigured: true })]);
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("does not present catalogued tools as executable when no runtime gateway is registered", () => {
    const { service } = harness();
    const result = service.tools();
    expect(result.runtime).toEqual({ registered: false, reason: "TOOL_GATEWAY_UNAVAILABLE" });
    expect(result.summary.executable).toBe(0);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.every(({ runtimeExecutable }) => runtimeExecutable === false)).toBe(true);
    expect(result.tools[0]).toEqual(expect.objectContaining({
      description: expect.any(String),
      purpose: "BUSINESS_APPLICATION_SERVICE",
      inputSchema: expect.any(Object),
      outputSchema: expect.any(Object),
    }));
  });

  it("returns bounded real automation definitions and execution evidence with secret-like keys redacted", async () => {
    const { service, prisma } = harness();
    const result = await service.automations(24, 10);
    expect(prisma.connectAutomation.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    expect(result.definitions.items[0]).toEqual(expect.objectContaining({ key: "welcome", currentVersion: expect.any(Object), latestVersion: expect.any(Object) }));
    expect(result.executions.items[0]).toEqual(expect.objectContaining({ status: "FAILED", steps: [expect.objectContaining({ retries: [expect.any(Object)], deadLetter: null })] }));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).toContain("[REDACTED]");
  });

  it("aggregates control-plane overview and analytics from real Prisma projections", async () => {
    const { service } = harness();
    const overview = await service.overview();
    expect(overview.conversations).toEqual(expect.objectContaining({ total: 3, active: 3, aiActive: 3 }));
    expect(overview.automations).toEqual(expect.objectContaining({ total: 1, active: 1 }));
    expect(overview.runtime.toolGateway).toEqual({ registered: false, executable: 0 });
    expect(overview.knowledge).toEqual(expect.objectContaining({ items: 2, versions: 2, published: 2, eligiblePublished: 2 }));
    expect(overview.automations).toEqual(expect.objectContaining({ executions: 4, unresolvedDeadLetters: 0 }));
    expect(overview.telemetry).toEqual(expect.objectContaining({
      processingByStatus: { COMPLETED: 2 },
      retrievalByResult: { SUFFICIENT_EVIDENCE: 2 },
      failuresByCode: { PROVIDER_UNAVAILABLE: 2 },
      processingLatencyMs: { average: 25, p95: 40 },
    }));

    const analytics = await service.analytics(12);
    expect(analytics.window.hours).toBe(12);
    expect(analytics.events).toEqual({ total: 2, byType: { KORAL_RESPONSE_SENT: 2 } });
    expect(analytics.telemetry).toEqual({
      aiUsage: "STRUCTURED_LOG_AND_REDIS_DAILY_COUNTER",
      durableAiInvocationStore: false,
      durableTokenCostStore: false,
      promptContentRecorded: false,
    });
    expect(analytics.knowledgeRetrieval).toEqual({ total: 2, byResult: { SUFFICIENT_EVIDENCE: 2 } });
    expect(analytics.processing).toEqual({
      total: 2,
      byStatus: { COMPLETED: 2 },
      failuresByCode: { PROVIDER_UNAVAILABLE: 2 },
      latencyMs: { average: 25, p95: 40 },
    });
    expect(analytics.automations).toEqual({ executions: { total: 1, byStatus: { FAILED: 1 } }, unresolvedDeadLetters: 0 });
  });

  it("distinguishes disabled and misconfigured runtimes", async () => {
    expect((await harness({ enabled: false }).service.runtimeAgents()).runtime.status).toBe("DISABLED");
    expect((await harness({ enabled: true, credential: "" }).service.runtimeAgents()).runtime.status).toBe("MISCONFIGURED");
    expect((await harness({ enabled: true, baseUrl: "http://openrouter.invalid" }).service.runtimeAgents()).runtime.status).toBe("MISCONFIGURED");
  });
});
