import type {
  AiGateway,
  AiGatewayRequest,
  AiGatewayResponse,
  AiGatewayResult,
  AiInvocationContext,
  AiUsage,
} from "./ai-contracts";
import { DataClassificationPolicy } from "./data-classification";
import { ModelRegistry } from "./model-registry";
import {
  CostPolicy,
  FallbackPolicy,
  RoutingPolicy,
  StructuredOutputPolicy,
  ToolCallingPolicy,
  type UsageMeter,
} from "./policies";

export interface OpenRouterTransportRequest {
  model: string;
  messages: AiGatewayRequest["messages"];
  maxOutputTokens: number;
  outputSchema?: AiGatewayRequest["outputSchema"];
  tools: readonly {
    name: string;
    description: string;
    inputSchema: Readonly<Record<string, unknown>>;
  }[];
  correlationId: string;
  timeoutMs: number;
}

export interface OpenRouterTransportResponse {
  content: string;
  structuredOutput?: unknown;
  toolCalls: AiGatewayResponse["toolCalls"];
  usage: Omit<AiUsage, "costMicros"> & { costMicros: number | null };
  costReportedByProvider: boolean;
  latencyMs: number;
}

/** The privileged transport owns credential resolution and HTTP delivery.
 * Its contract accepts no key so callers, Koral and audit logs cannot receive
 * OPENROUTER_API_KEY through this module. */
export interface OpenRouterTransport {
  complete(
    request: OpenRouterTransportRequest,
  ): Promise<OpenRouterTransportResponse>;
}

export interface PricingEstimator {
  estimateCostMicros(
    model: string,
    inputTokens: number,
    maxOutputTokens: number,
  ): number | null;
}

export class OpenRouterProvider implements AiGateway {
  constructor(
    private readonly transport: OpenRouterTransport,
    private readonly registry: ModelRegistry,
    private readonly usageMeter: UsageMeter,
    private readonly pricing: PricingEstimator,
    private readonly classificationPolicy = new DataClassificationPolicy(),
    private readonly routingPolicy = new RoutingPolicy(),
    private readonly fallbackPolicy = new FallbackPolicy(),
    private readonly costPolicy = new CostPolicy(),
    private readonly structuredOutputPolicy = new StructuredOutputPolicy(),
    private readonly toolCallingPolicy = new ToolCallingPolicy(),
    private readonly maximumAttempts = 3,
    private readonly defaultTimeoutMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  async infer(
    request: AiGatewayRequest,
    context: AiInvocationContext,
  ): Promise<AiGatewayResult> {
    try {
      return { ok: true, response: await this.inferOrThrow(request, context) };
    } catch (error) {
      const rawCode =
        error instanceof Error
          ? (error.message.split(":")[0] ?? "PROVIDER_ERROR")
          : "PROVIDER_ERROR";
      const code = this.normalizeErrorCode(rawCode);
      return {
        ok: false,
        error: {
          code,
          message: `AI_GATEWAY_${code}`,
          retryable: [
            "MODEL_NOT_AVAILABLE",
            "PROVIDER_ERROR",
            "RATE_LIMITED",
            "TIMEOUT",
          ].includes(code),
          correlationId: context.audit.correlationId || "unknown",
        },
      };
    }
  }

  private async inferOrThrow(
    request: AiGatewayRequest,
    context: AiInvocationContext,
  ): Promise<AiGatewayResponse> {
    if (request.version !== "v1") throw new Error("INVALID_REQUEST:VERSION");
    if (
      !context.identity.effectiveActorId ||
      !context.audit.correlationId ||
      !context.policy.purpose
    ) {
      throw new Error("INVALID_REQUEST:CONTEXT");
    }

    const profile = this.registry.getPublished(request.modelProfileId);
    if (profile.purpose !== context.policy.purpose)
      throw new Error("INVALID_REQUEST:PURPOSE");
    if (request.messages.length === 0)
      throw new Error("INVALID_REQUEST:MESSAGES");
    if (
      request.maxOutputTokens &&
      request.maxOutputTokens > profile.maxOutputTokens
    ) {
      throw new Error("INVALID_REQUEST:MAX_OUTPUT_TOKENS");
    }

    this.classificationPolicy.assertAllowed(
      context.policy.dataClassification,
      profile.dataClassificationPolicy,
      {
        purpose: context.policy.purpose,
        consentVerified: context.policy.consentVerified,
        externalProvider: true,
      },
    );
    this.structuredOutputPolicy.assertRequest(profile, request);
    this.toolCallingPolicy.assertRequest(profile, request, context);

    const maxOutputTokens = request.maxOutputTokens ?? profile.maxOutputTokens;
    const estimatedInputTokens = request.messages.reduce(
      (total, message) => total + Math.ceil(message.content.length / 4),
      0,
    );
    if (estimatedInputTokens > profile.maxInputTokens)
      throw new Error("INVALID_REQUEST:MAX_INPUT_TOKENS");

    const remainingMs = Date.parse(context.deadlineAt) - this.now();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      throw new Error("TIMEOUT:DEADLINE_EXPIRED");
    }
    const requestedTimeoutMs =
      request.timeout?.milliseconds ?? this.defaultTimeoutMs;
    if (!Number.isInteger(requestedTimeoutMs) || requestedTimeoutMs < 1) {
      throw new Error("INVALID_REQUEST:TIMEOUT");
    }
    const timeoutMs = Math.max(
      1,
      Math.min(requestedTimeoutMs, this.defaultTimeoutMs, remainingMs),
    );
    const requestedAttempts =
      request.timeout?.maxAttempts ?? this.maximumAttempts;
    if (!Number.isInteger(requestedAttempts) || requestedAttempts < 1) {
      throw new Error("INVALID_REQUEST:MAX_ATTEMPTS");
    }
    const routes = this.routingPolicy
      .routes(profile, "openrouter")
      .slice(0, Math.min(requestedAttempts, this.maximumAttempts));
    let lastError: unknown;

    for (const [routeIndex, route] of routes.entries()) {
      const attempt = routeIndex + 1;
      const attemptStartedAt = this.now();
      const currentDailyCostMicros =
        await this.usageMeter.currentDailyCostMicros(profile.id);
      const estimatedCostMicros = this.pricing.estimateCostMicros(
        route.model,
        estimatedInputTokens,
        maxOutputTokens,
      );
      this.costPolicy.assertRequestAllowed(
        profile,
        currentDailyCostMicros,
        estimatedCostMicros,
      );
      if (estimatedCostMicros === null) {
        throw new Error("BUDGET_EXCEEDED:PRICING_UNKNOWN");
      }
      const reserved = await this.usageMeter.reserveDailyCost(
        profile.id,
        estimatedCostMicros,
        profile.budgetPolicy.maxCostMicrosPerDay,
      );
      if (!reserved) throw new Error("BUDGET_EXCEEDED:DAILY");
      let reservationActive = true;
      let meteredUsage: AiUsage | undefined;
      let costSource: "PROVIDER_REPORTED" | "CONSERVATIVE_ESTIMATE" | undefined;
      try {
        const response = await this.transport.complete({
          model: route.model,
          messages: request.messages,
          maxOutputTokens,
          outputSchema: request.outputSchema,
          tools: (request.tools ?? []).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
          correlationId: context.audit.correlationId,
          timeoutMs,
        });
        const actualCostMicros =
          response.usage.costMicros ??
          this.pricing.estimateCostMicros(
            route.model,
            response.usage.inputTokens,
            response.usage.outputTokens,
          );
        this.costPolicy.assertRequestAllowed(
          profile,
          currentDailyCostMicros,
          actualCostMicros,
        );
        meteredUsage = {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens,
          costMicros: actualCostMicros ?? 0,
        };
        costSource = response.costReportedByProvider
          ? "PROVIDER_REPORTED"
          : "CONSERVATIVE_ESTIMATE";
        reservationActive = false;
        const withinDailyBudget = await this.usageMeter.settleDailyCost(
          profile.id,
          estimatedCostMicros,
          meteredUsage.costMicros,
          profile.budgetPolicy.maxCostMicrosPerDay,
        );
        if (!withinDailyBudget) throw new Error("BUDGET_EXCEEDED:DAILY");
        if (response.toolCalls.length === 0) {
          this.structuredOutputPolicy.assertResponse(
            request,
            response.structuredOutput,
          );
        }
        this.toolCallingPolicy.assertResponse(
          request,
          response.toolCalls.map((toolCall) => toolCall.name),
        );
        await this.usageMeter.record({
          actorId: context.identity.effectiveActorId,
          modelProfileId: profile.id,
          provider: route.provider,
          model: route.model,
          purpose: context.policy.purpose,
          correlationId: context.audit.correlationId,
          latencyMs: response.latencyMs,
          success: true,
          attempt,
          costSource,
          usage: meteredUsage,
        });
        return {
          version: "v1",
          provider: route.provider,
          model: route.model,
          content: response.content,
          structuredOutput: response.structuredOutput,
          toolCalls: response.toolCalls,
          usage: meteredUsage,
          correlationId: context.audit.correlationId,
        };
      } catch (error) {
        const errorCode =
          error instanceof Error
            ? (error.message.split(":")[0] ?? "PROVIDER_ERROR")
            : "PROVIDER_ERROR";
        if (reservationActive) {
          if (errorCode === "TIMEOUT") {
            // A timeout has an uncertain billing outcome. Retain the
            // conservative reservation instead of understating daily spend.
            meteredUsage = {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              costMicros: estimatedCostMicros,
            };
            costSource = "CONSERVATIVE_ESTIMATE";
          } else {
            await this.releaseReservation(profile.id, estimatedCostMicros);
          }
          reservationActive = false;
        }
        lastError = error;
        await this.recordFailure({
          actorId: context.identity.effectiveActorId,
          modelProfileId: profile.id,
          provider: route.provider,
          model: route.model,
          purpose: context.policy.purpose,
          correlationId: context.audit.correlationId,
          latencyMs: Math.max(0, this.now() - attemptStartedAt),
          success: false,
          errorCode,
          attempt,
          costSource,
          usage: meteredUsage,
        });
        if (!this.fallbackPolicy.canFallback(errorCode, routes[routeIndex + 1]))
          throw error;
      }
    }
    throw lastError ?? new Error("MODEL_NOT_AVAILABLE");
  }

  private async releaseReservation(
    modelProfileId: string,
    reservedCostMicros: number,
  ): Promise<void> {
    try {
      await this.usageMeter.releaseDailyCost(
        modelProfileId,
        reservedCostMicros,
      );
    } catch {
      // Leaving a conservative reservation in place is safer than retrying
      // an inference whose cost state cannot be reconciled.
    }
  }

  private async recordFailure(
    record: Parameters<UsageMeter["record"]>[0],
  ): Promise<void> {
    try {
      await this.usageMeter.record(record);
    } catch {
      // Preserve the provider/policy error. The runtime meter logs its own
      // bounded failure without prompt, response or credential content.
    }
  }

  private normalizeErrorCode(
    code: string,
  ):
    | "AUTHORIZATION_DENIED"
    | "BUDGET_EXCEEDED"
    | "DATA_CLASSIFICATION_DENIED"
    | "INVALID_REQUEST"
    | "MODEL_NOT_AVAILABLE"
    | "OUTPUT_SCHEMA_VIOLATION"
    | "PROVIDER_ERROR"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "TOOL_POLICY_DENIED" {
    if (code === "BUDGET_EXCEEDED") return code;
    if (code === "DATA_CLASSIFICATION_DENIED") return code;
    if (code === "INVALID_REQUEST") return code;
    if (code === "MODEL_NOT_AVAILABLE") return code;
    if (code === "MODEL_PROFILE_NOT_AVAILABLE") return "MODEL_NOT_AVAILABLE";
    if (code === "OUTPUT_SCHEMA_VIOLATION") return code;
    if (code === "RATE_LIMITED") return code;
    if (code === "TIMEOUT") return code;
    if (code.startsWith("TOOL_")) return "TOOL_POLICY_DENIED";
    if (code.includes("AUTHORIZATION") || code.includes("PERMISSION")) {
      return "AUTHORIZATION_DENIED";
    }
    return "PROVIDER_ERROR";
  }
}
