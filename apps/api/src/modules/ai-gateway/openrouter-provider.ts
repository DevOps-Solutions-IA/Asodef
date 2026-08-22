import type { AiGateway, AiGatewayRequest, AiGatewayResponse, AiInvocationContext, AiUsage } from "./ai-contracts";
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
}

export interface OpenRouterTransportResponse {
  content: string;
  structuredOutput?: unknown;
  toolCalls: AiGatewayResponse["toolCalls"];
  usage: AiUsage;
}

/** The privileged transport owns credential resolution and HTTP delivery.
 * Its contract accepts no key so callers, Koral and audit logs cannot receive
 * OPENROUTER_API_KEY through this module. */
export interface OpenRouterTransport {
  complete(request: OpenRouterTransportRequest): Promise<OpenRouterTransportResponse>;
}

export interface PricingEstimator {
  estimateCostMicros(model: string, inputTokens: number, maxOutputTokens: number): number | null;
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
  ) {}

  async infer(request: AiGatewayRequest, context: AiInvocationContext): Promise<AiGatewayResponse> {
    if (request.version !== "v1") throw new Error("INVALID_REQUEST:VERSION");
    if (!context.actorId || !context.correlationId || !context.purpose) throw new Error("INVALID_REQUEST:CONTEXT");

    const profile = this.registry.getPublished(request.modelProfileId);
    if (profile.purpose !== context.purpose) throw new Error("INVALID_REQUEST:PURPOSE");
    if (request.messages.length === 0) throw new Error("INVALID_REQUEST:MESSAGES");
    if (request.maxOutputTokens && request.maxOutputTokens > profile.maxOutputTokens) {
      throw new Error("INVALID_REQUEST:MAX_OUTPUT_TOKENS");
    }

    this.classificationPolicy.assertAllowed(context.dataClassification, profile.dataClassificationPolicy, {
      purpose: context.purpose,
      consentVerified: context.consentVerified ?? false,
      externalProvider: true,
    });
    this.structuredOutputPolicy.assertRequest(profile, request);
    this.toolCallingPolicy.assertRequest(profile, request, context);

    const maxOutputTokens = request.maxOutputTokens ?? profile.maxOutputTokens;
    const estimatedInputTokens = request.messages.reduce((total, message) => total + Math.ceil(message.content.length / 4), 0);
    if (estimatedInputTokens > profile.maxInputTokens) throw new Error("INVALID_REQUEST:MAX_INPUT_TOKENS");

    const routes = this.routingPolicy.routes(profile, "openrouter");
    const currentDailyCostMicros = await this.usageMeter.currentDailyCostMicros(profile.id);
    let lastError: unknown;

    for (const [routeIndex, route] of routes.entries()) {
      const estimatedCostMicros = this.pricing.estimateCostMicros(route.model, estimatedInputTokens, maxOutputTokens);
      this.costPolicy.assertRequestAllowed(profile, currentDailyCostMicros, estimatedCostMicros);
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
          correlationId: context.correlationId,
        });
        this.structuredOutputPolicy.assertResponse(request, response.structuredOutput);
        this.toolCallingPolicy.assertResponse(
          request,
          response.toolCalls.map((toolCall) => toolCall.name),
        );
        await this.usageMeter.record({
          actorId: context.actorId,
          modelProfileId: profile.id,
          provider: route.provider,
          model: route.model,
          purpose: context.purpose,
          correlationId: context.correlationId,
          usage: response.usage,
        });
        return {
          version: "v1",
          provider: route.provider,
          model: route.model,
          content: response.content,
          structuredOutput: response.structuredOutput,
          toolCalls: response.toolCalls,
          usage: response.usage,
          correlationId: context.correlationId,
        };
      } catch (error) {
        lastError = error;
        const errorCode = error instanceof Error ? (error.message.split(":")[0] ?? "PROVIDER_ERROR") : "PROVIDER_ERROR";
        if (!this.fallbackPolicy.canFallback(errorCode, routes[routeIndex + 1])) throw error;
      }
    }
    throw lastError ?? new Error("MODEL_NOT_AVAILABLE");
  }
}
