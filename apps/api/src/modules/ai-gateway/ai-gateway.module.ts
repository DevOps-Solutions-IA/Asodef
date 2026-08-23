import { Module, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type {
  AiGateway,
  AiGatewayRequest,
  AiGatewayResult,
  AiInvocationContext,
} from "./ai-contracts";
import { ModelRegistry } from "./model-registry";
import {
  OpenRouterClient,
  type OpenRouterCredentialSource,
} from "./openrouter-client";
import { OpenRouterProvider } from "./openrouter-provider";
import { DataClassificationPolicy } from "./data-classification";
import {
  CostPolicy,
  FallbackPolicy,
  RoutingPolicy,
  StructuredOutputPolicy,
  ToolCallingPolicy,
} from "./policies";
import { RedisUsageMeter } from "./redis-usage-meter";
import {
  APPROVED_MODEL_PROFILES,
  ApprovedModelPricingEstimator,
} from "./runtime-model-catalog";

export const AI_GATEWAY = Symbol("AI_GATEWAY");
export const AI_MODEL_REGISTRY = Symbol("AI_MODEL_REGISTRY");

class EnvironmentOpenRouterCredentialSource implements OpenRouterCredentialSource {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  resolve(): string {
    return this.config.get("OPENROUTER_API_KEY", { infer: true });
  }
}

class DisabledAiGateway implements AiGateway {
  async infer(
    _request: AiGatewayRequest,
    context: AiInvocationContext,
  ): Promise<AiGatewayResult> {
    return {
      ok: false,
      error: {
        code: "MODEL_NOT_AVAILABLE",
        message: "AI_GATEWAY_MODEL_NOT_AVAILABLE",
        retryable: false,
        correlationId: context.audit.correlationId || "unknown",
      },
    };
  }
}

const runtimeProviders: Provider[] = [
  RedisUsageMeter,
  {
    provide: AI_MODEL_REGISTRY,
    useFactory: () => new ModelRegistry(APPROVED_MODEL_PROFILES),
  },
  {
    provide: OpenRouterClient,
    inject: [ConfigService],
    useFactory: (config: ConfigService<EnvConfig, true>) =>
      new OpenRouterClient(new EnvironmentOpenRouterCredentialSource(config), {
        baseUrl: config.get("OPENROUTER_BASE_URL", { infer: true }),
        timeoutMs: config.get("OPENROUTER_TIMEOUT_MS", { infer: true }),
        circuitFailureThreshold: config.get(
          "OPENROUTER_CIRCUIT_FAILURE_THRESHOLD",
          { infer: true },
        ),
        circuitResetMs: config.get("OPENROUTER_CIRCUIT_RESET_MS", {
          infer: true,
        }),
      }),
  },
  {
    provide: OpenRouterProvider,
    inject: [
      OpenRouterClient,
      AI_MODEL_REGISTRY,
      RedisUsageMeter,
      ConfigService,
    ],
    useFactory: (
      transport: OpenRouterClient,
      registry: ModelRegistry,
      meter: RedisUsageMeter,
      config: ConfigService<EnvConfig, true>,
    ) =>
      new OpenRouterProvider(
        transport,
        registry,
        meter,
        new ApprovedModelPricingEstimator(),
        new DataClassificationPolicy(),
        new RoutingPolicy(),
        new FallbackPolicy(),
        new CostPolicy(),
        new StructuredOutputPolicy(),
        new ToolCallingPolicy(),
        config.get("OPENROUTER_MAX_ATTEMPTS", { infer: true }),
        config.get("OPENROUTER_TIMEOUT_MS", { infer: true }),
      ),
  },
  {
    provide: AI_GATEWAY,
    inject: [ConfigService, OpenRouterProvider],
    useFactory: (
      config: ConfigService<EnvConfig, true>,
      provider: OpenRouterProvider,
    ): AiGateway =>
      config.get("AI_RUNTIME_ENABLED", { infer: true })
        ? provider
        : new DisabledAiGateway(),
  },
];

@Module({
  providers: runtimeProviders,
  exports: [AI_GATEWAY, AI_MODEL_REGISTRY],
})
export class AiGatewayModule {}
