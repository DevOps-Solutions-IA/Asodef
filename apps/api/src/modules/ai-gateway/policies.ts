import type {
  AiGatewayRequest,
  AiInvocationContext,
  AiUsage,
} from "./ai-contracts";
import type { ModelProfile } from "./model-registry";

export interface ModelRoute {
  provider: string;
  model: string;
  fallbackIndex: number;
}

export class RoutingPolicy {
  routes(profile: ModelProfile, provider: string): readonly ModelRoute[] {
    if (profile.status !== "PUBLISHED")
      throw new Error("MODEL_PROFILE_NOT_PUBLISHED");
    if (!profile.allowedProviders.includes(provider))
      throw new Error("PROVIDER_NOT_ALLOWED");
    return [profile.primaryModel, ...profile.fallbackModels].map(
      (model, fallbackIndex) => ({
        provider,
        model,
        fallbackIndex,
      }),
    );
  }
}

export class FallbackPolicy {
  canFallback(errorCode: string, nextRoute: ModelRoute | undefined): boolean {
    if (!nextRoute) return false;
    return ["MODEL_NOT_AVAILABLE", "PROVIDER_ERROR", "RATE_LIMITED"].includes(
      errorCode,
    );
  }
}

export interface UsageRecord {
  actorId: string;
  modelProfileId: string;
  provider: string;
  model: string;
  purpose: string;
  correlationId: string;
  usage: AiUsage;
}

export interface UsageMeter {
  currentDailyCostMicros(modelProfileId: string): Promise<number>;
  record(record: UsageRecord): Promise<void>;
}

export class CostPolicy {
  assertRequestAllowed(
    profile: ModelProfile,
    currentDailyCostMicros: number,
    estimatedCostMicros: number | null,
  ): void {
    if (
      estimatedCostMicros === null &&
      profile.budgetPolicy.failClosedWhenPricingUnknown
    ) {
      throw new Error("BUDGET_EXCEEDED:PRICING_UNKNOWN");
    }
    if (
      estimatedCostMicros !== null &&
      estimatedCostMicros > profile.budgetPolicy.maxCostMicrosPerRequest
    ) {
      throw new Error("BUDGET_EXCEEDED:REQUEST");
    }
    if (
      estimatedCostMicros !== null &&
      currentDailyCostMicros + estimatedCostMicros >
        profile.budgetPolicy.maxCostMicrosPerDay
    ) {
      throw new Error("BUDGET_EXCEEDED:DAILY");
    }
  }
}

export class StructuredOutputPolicy {
  assertRequest(profile: ModelProfile, request: AiGatewayRequest): void {
    if (profile.structuredOutputRequired && !request.outputSchema)
      throw new Error("OUTPUT_SCHEMA_REQUIRED");
    if (request.outputSchema && request.outputSchema.type !== "object")
      throw new Error("OUTPUT_SCHEMA_MUST_BE_OBJECT");
  }

  assertResponse(request: AiGatewayRequest, structuredOutput: unknown): void {
    if (!request.outputSchema) return;
    if (
      !structuredOutput ||
      typeof structuredOutput !== "object" ||
      Array.isArray(structuredOutput)
    ) {
      throw new Error("OUTPUT_SCHEMA_VIOLATION");
    }
  }
}

export class ToolCallingPolicy {
  assertRequest(
    profile: ModelProfile,
    request: AiGatewayRequest,
    context: AiInvocationContext,
  ): void {
    const tools = request.tools ?? [];
    if (tools.length > 0 && !profile.toolCallingAllowed)
      throw new Error("TOOL_CALLING_NOT_ALLOWED");
    for (const tool of tools) {
      if (tool.status !== "PUBLISHED")
        throw new Error(`TOOL_NOT_PUBLISHED:${tool.name}`);
      if (!context.identity.permissions.includes(tool.permission))
        throw new Error(`TOOL_PERMISSION_DENIED:${tool.name}`);
    }
  }

  assertResponse(
    request: AiGatewayRequest,
    toolCallNames: readonly string[],
  ): void {
    const allowedNames = new Set(
      (request.tools ?? []).map((tool) => tool.name),
    );
    for (const name of toolCallNames) {
      if (!allowedNames.has(name))
        throw new Error(`TOOL_POLICY_DENIED:UNDECLARED_TOOL:${name}`);
    }
  }
}
