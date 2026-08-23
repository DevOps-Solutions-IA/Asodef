import { Logger } from "@nestjs/common";
import { RedisUsageMeter } from "./redis-usage-meter";

describe("RedisUsageMeter", () => {
  afterEach(() => jest.restoreAllMocks());

  it("records distributed daily cost and content-free audit metadata", async () => {
    const commands: Array<readonly unknown[]> = [];
    const redis = {
      getClient: () => ({
        get: async () => "250",
        eval: async (...args: unknown[]) => {
          commands.push(args);
          return 1;
        },
      }),
    };
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation();
    const meter = new RedisUsageMeter(redis as never);

    await expect(
      meter.currentDailyCostMicros("koral-crm-assistant"),
    ).resolves.toBe(250);
    await expect(
      meter.reserveDailyCost("koral-crm-assistant", 100, 1_000),
    ).resolves.toBe(true);
    await expect(
      meter.settleDailyCost("koral-crm-assistant", 100, 75, 1_000),
    ).resolves.toBe(true);
    await meter.releaseDailyCost("koral-crm-assistant", 100);
    await meter.record({
      actorId: "actor-1",
      modelProfileId: "koral-crm-assistant",
      provider: "openrouter",
      model: "approved/model",
      purpose: "crm-assistance",
      correlationId: "correlation-1",
      attempt: 1,
      latencyMs: 25,
      success: true,
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
        costMicros: 100,
      },
    });

    expect(commands).toHaveLength(3);
    expect(commands[0]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("local current"),
        1,
        expect.stringContaining("ai:usage:cost:"),
        100,
        1_000,
        172_800,
      ]),
    );
    const serializedLog = JSON.stringify(log.mock.calls);
    expect(serializedLog).toContain("AI_GATEWAY_INVOCATION");
    expect(serializedLog).not.toMatch(/messages|content|credential|api.?key/i);
  });

  it("fails closed when the distributed meter contains invalid state", async () => {
    const redis = {
      getClient: () => ({ get: async () => "not-a-number" }),
    };
    const meter = new RedisUsageMeter(redis as never);
    await expect(meter.currentDailyCostMicros("profile")).rejects.toThrow(
      "AI_USAGE_METER_INVALID_STATE",
    );
  });
});
