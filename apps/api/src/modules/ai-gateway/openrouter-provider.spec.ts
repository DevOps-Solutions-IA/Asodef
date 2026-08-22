import { ModelRegistry } from "./model-registry";
import { publishedProfile } from "./model-registry.spec";
import {
  OpenRouterProvider,
  type OpenRouterTransport,
  type PricingEstimator,
} from "./openrouter-provider";
import type { UsageMeter, UsageRecord } from "./policies";

describe("OpenRouterProvider", () => {
  const response = {
    content: "ok",
    structuredOutput: { answer: "ok" },
    toolCalls: [],
    usage: {
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
      costMicros: 100,
    },
  };
  const request = {
    version: "v1" as const,
    modelProfileId: publishedProfile.id,
    messages: [{ role: "user" as const, content: "Summarize this account" }],
    outputSchema: { type: "object", additionalProperties: false },
  };
  const context = {
    version: "v1" as const,
    identity: {
      principalType: "KORAL" as const,
      principalId: "koral",
      effectiveActorId: "actor-1",
      permissions: ["crm.read"],
      identityLevel: "MFA_VERIFIED" as const,
    },
    audit: { correlationId: "correlation-1", conversationId: "conversation-1" },
    policy: {
      purpose: "crm-assistance",
      consentPurposeKeys: ["crm-assistance"],
      piiPolicy: "MINIMIZE" as const,
      dataClassification: "PERSONAL" as const,
      consentVerified: true,
    },
    deadlineAt: "2026-08-22T20:00:00.000Z",
  };

  function buildProvider(
    transport: OpenRouterTransport,
    pricing: PricingEstimator = { estimateCostMicros: () => 100 },
  ) {
    const records: UsageRecord[] = [];
    const meter: UsageMeter = {
      currentDailyCostMicros: async () => 0,
      record: async (record) => {
        records.push(record);
      },
    };
    return {
      provider: new OpenRouterProvider(
        transport,
        new ModelRegistry([publishedProfile]),
        meter,
        pricing,
      ),
      records,
    };
  }

  it("routes through the credential-free transport contract and records governed usage", async () => {
    const calls: unknown[] = [];
    const { provider, records } = buildProvider({
      complete: async (transportRequest) => {
        calls.push(transportRequest);
        return response;
      },
    });
    await expect(provider.infer(request, context)).resolves.toMatchObject({
      ok: true,
      response: {
        provider: "openrouter",
        model: publishedProfile.primaryModel,
        correlationId: context.audit.correlationId,
        usage: response.usage,
      },
    });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toMatch(/credential|api.?key|secret/i);
    expect(records).toEqual([
      expect.objectContaining({
        actorId: context.identity.effectiveActorId,
        modelProfileId: publishedProfile.id,
        usage: response.usage,
      }),
    ]);
  });

  it("uses only declared fallbacks for retryable provider failures", async () => {
    const models: string[] = [];
    const { provider } = buildProvider({
      complete: async (transportRequest) => {
        models.push(transportRequest.model);
        if (models.length === 1) throw new Error("RATE_LIMITED");
        return response;
      },
    });
    await expect(provider.infer(request, context)).resolves.toMatchObject({
      ok: true,
      response: { model: publishedProfile.fallbackModels[0] },
    });
    expect(models).toEqual([
      publishedProfile.primaryModel,
      publishedProfile.fallbackModels[0],
    ]);
  });

  it("fails before provider invocation when classification or pricing policy denies the request", async () => {
    let invocations = 0;
    const transport = { complete: async () => (invocations++, response) };
    const { provider } = buildProvider(transport);
    await expect(
      provider.infer(request, {
        ...context,
        policy: { ...context.policy, consentVerified: false },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DATA_CLASSIFICATION_DENIED", retryable: false },
    });
    expect(invocations).toBe(0);

    const unknownPricing = buildProvider(transport, {
      estimateCostMicros: () => null,
    }).provider;
    await expect(unknownPricing.infer(request, context)).resolves.toMatchObject(
      {
        ok: false,
        error: { code: "BUDGET_EXCEEDED", retryable: false },
      },
    );
    expect(invocations).toBe(0);
  });

  it("rejects undeclared provider tool calls instead of forwarding them", async () => {
    const { provider } = buildProvider({
      complete: async () => ({
        ...response,
        toolCalls: [{ id: "call-1", name: "undeclared_tool", arguments: {} }],
      }),
    });
    await expect(provider.infer(request, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_POLICY_DENIED", retryable: false },
    });
  });
});
