import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../common/redis/redis.service";
import type { UsageMeter, UsageRecord } from "./policies";

const COST_KEY_TTL_SECONDS = 172_800;

/** Distributed daily meter and content-free audit signal. Prompt/response,
 * tool arguments and credentials are intentionally absent from UsageRecord. */
@Injectable()
export class RedisUsageMeter implements UsageMeter {
  private readonly logger = new Logger(RedisUsageMeter.name);

  constructor(private readonly redis: RedisService) {}

  async currentDailyCostMicros(modelProfileId: string): Promise<number> {
    const value = await this.redis.getClient().get(costKey(modelProfileId));
    if (value === null) return 0;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("AI_USAGE_METER_INVALID_STATE");
    }
    return parsed;
  }

  async reserveDailyCost(
    modelProfileId: string,
    estimatedCostMicros: number,
    dailyLimitMicros: number,
  ): Promise<boolean> {
    const result = await this.redis.getClient().eval(
      `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
       local proposed = current + tonumber(ARGV[1])
       if proposed > tonumber(ARGV[2]) then return 0 end
       redis.call('SET', KEYS[1], proposed, 'EX', ARGV[3])
       return 1`,
      1,
      costKey(modelProfileId),
      estimatedCostMicros,
      dailyLimitMicros,
      COST_KEY_TTL_SECONDS,
    );
    return result === 1;
  }

  async settleDailyCost(
    modelProfileId: string,
    reservedCostMicros: number,
    actualCostMicros: number,
    dailyLimitMicros: number,
  ): Promise<boolean> {
    const result = await this.redis.getClient().eval(
      `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
       local settled = math.max(0, current - tonumber(ARGV[1]) + tonumber(ARGV[2]))
       redis.call('SET', KEYS[1], settled, 'EX', ARGV[4])
       if settled > tonumber(ARGV[3]) then return 0 end
       return 1`,
      1,
      costKey(modelProfileId),
      reservedCostMicros,
      actualCostMicros,
      dailyLimitMicros,
      COST_KEY_TTL_SECONDS,
    );
    return result === 1;
  }

  async releaseDailyCost(
    modelProfileId: string,
    reservedCostMicros: number,
  ): Promise<void> {
    await this.redis.getClient().eval(
      `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
       local released = math.max(0, current - tonumber(ARGV[1]))
       redis.call('SET', KEYS[1], released, 'EX', ARGV[2])
       return released`,
      1,
      costKey(modelProfileId),
      reservedCostMicros,
      COST_KEY_TTL_SECONDS,
    );
  }

  async record(record: UsageRecord): Promise<void> {
    this.logger.log(
      JSON.stringify({
        event: "AI_GATEWAY_INVOCATION",
        actorId: record.actorId,
        profile: record.modelProfileId,
        provider: record.provider,
        model: record.model,
        purpose: record.purpose,
        correlationId: record.correlationId,
        attempt: record.attempt,
        latencyMs: record.latencyMs,
        success: record.success,
        errorCode: record.errorCode ?? null,
        inputTokens: record.usage?.inputTokens ?? null,
        outputTokens: record.usage?.outputTokens ?? null,
        costMicros: record.usage?.costMicros ?? null,
        costSource: record.costSource ?? null,
      }),
    );
  }
}

function costKey(modelProfileId: string): string {
  const safeProfile = modelProfileId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `ai:usage:cost:${new Date().toISOString().slice(0, 10)}:${safeProfile}`;
}
