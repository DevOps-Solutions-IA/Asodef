import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { RedisModule } from "../../common/redis/redis.module";
import { RedisService } from "../../common/redis/redis.service";
import type { AiGateway } from "./ai-contracts";
import { AI_GATEWAY, AiGatewayModule } from "./ai-gateway.module";
import { OpenRouterClient } from "./openrouter-client";
import { RedisUsageMeter } from "./redis-usage-meter";

describe("AiGatewayModule", () => {
  it("stays disabled without resolving or requiring a production credential", async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AI_RUNTIME_ENABLED: false,
              OPENROUTER_API_KEY: "",
              OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
              OPENROUTER_TIMEOUT_MS: 5_000,
              OPENROUTER_MAX_ATTEMPTS: 2,
              OPENROUTER_CIRCUIT_FAILURE_THRESHOLD: 3,
              OPENROUTER_CIRCUIT_RESET_MS: 30_000,
            }),
          ],
        }),
        RedisModule,
        AiGatewayModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue({ getClient: () => ({}) })
      .compile();

    const gateway = module.get<AiGateway>(AI_GATEWAY);
    await expect(
      gateway.infer(
        {
          version: "v1",
          modelProfileId: "koral-crm-assistant",
          messages: [{ role: "user", content: "test" }],
        },
        {
          version: "v1",
          identity: {
            principalType: "KORAL",
            principalId: "koral",
            effectiveActorId: "actor-1",
            permissions: [],
            identityLevel: "AUTHENTICATED",
          },
          audit: { correlationId: "correlation-1" },
          policy: {
            purpose: "crm-assistance",
            consentPurposeKeys: [],
            consentVerified: false,
            piiPolicy: "MINIMIZE",
            dataClassification: "INTERNAL",
          },
          deadlineAt: "2099-01-01T00:00:00.000Z",
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "MODEL_NOT_AVAILABLE", retryable: false },
    });
    await module.close();
  });

  it("composes the governed provider with a fake HTTP transport in CI", async () => {
    const complete = jest.fn().mockResolvedValue({
      content: '{"answer":"ok"}',
      structuredOutput: { answer: "ok" },
      toolCalls: [],
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
        costMicros: 100,
      },
      costReportedByProvider: true,
      latencyMs: 25,
    });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              AI_RUNTIME_ENABLED: true,
              OPENROUTER_API_KEY: "unused-ci-placeholder",
              OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
              OPENROUTER_TIMEOUT_MS: 5_000,
              OPENROUTER_MAX_ATTEMPTS: 2,
              OPENROUTER_CIRCUIT_FAILURE_THRESHOLD: 3,
              OPENROUTER_CIRCUIT_RESET_MS: 30_000,
            }),
          ],
        }),
        RedisModule,
        AiGatewayModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue({
        getClient: () => ({
          get: async () => null,
          eval: async () => 1,
        }),
      })
      .overrideProvider(RedisUsageMeter)
      .useValue({
        currentDailyCostMicros: async () => 0,
        reserveDailyCost: async () => true,
        settleDailyCost: async () => true,
        releaseDailyCost: async () => undefined,
        record: async () => undefined,
      })
      .overrideProvider(OpenRouterClient)
      .useValue({ complete })
      .compile();

    const gateway = module.get<AiGateway>(AI_GATEWAY);
    await expect(
      gateway.infer(
        {
          version: "v1",
          modelProfileId: "koral-crm-assistant",
          messages: [{ role: "user", content: "test" }],
          outputSchema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
            additionalProperties: false,
          },
        },
        {
          version: "v1",
          identity: {
            principalType: "KORAL",
            principalId: "koral",
            effectiveActorId: "actor-1",
            permissions: [],
            identityLevel: "AUTHENTICATED",
          },
          audit: { correlationId: "correlation-1" },
          policy: {
            purpose: "crm-assistance",
            consentPurposeKeys: [],
            consentVerified: false,
            piiPolicy: "MINIMIZE",
            dataClassification: "INTERNAL",
          },
          deadlineAt: "2099-01-01T00:00:00.000Z",
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      response: {
        provider: "openrouter",
        model: "openai/gpt-4.1-mini",
      },
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/gpt-4.1-mini" }),
    );
    await module.close();
  });
});
