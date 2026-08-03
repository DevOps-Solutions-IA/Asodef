import { Injectable } from "@nestjs/common";
import { RedisService } from "../../common/redis/redis.service";

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter backed by Redis (INCR + conditional EXPIRE), used
 * for coarse IP-based login rate limiting - independent of and in
 * addition to the per-account lockout tracked on User. Redis being
 * temporarily unavailable must never itself block login attempts (see
 * checkAndIncrement's catch) - it degrades to "not rate limited" rather
 * than locking everyone out.
 */
@Injectable()
export class RateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  async checkAndIncrement(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
      const client = this.redisService.getClient();
      const redisKey = `ratelimit:${key}`;
      const count = await client.incr(redisKey);
      if (count === 1) {
        await client.expire(redisKey, windowSeconds);
      }
      const ttl = await client.ttl(redisKey);
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

      return {
        limited: count > max,
        remaining: Math.max(0, max - count),
        retryAfterSeconds,
      };
    } catch {
      // Fail open: an unavailable Redis must not itself become a denial
      // of service against login.
      return { limited: false, remaining: max, retryAfterSeconds: 0 };
    }
  }
}
