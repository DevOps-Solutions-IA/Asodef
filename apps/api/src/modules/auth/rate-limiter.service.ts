import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../common/redis/redis.service";

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimitDependencyUnavailableError extends Error {
  constructor() {
    super("Rate-limit dependency unavailable.");
    this.name = "RateLimitDependencyUnavailableError";
  }
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
  private readonly logger = new Logger(RateLimiterService.name);

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
      // of service against login. US-009 section 10: this degradation is
      // operationally significant (rate limiting is effectively disabled
      // until Redis recovers) and worth a log line - deliberately without
      // the key itself, which may embed an IP address or identifier hash
      // (a high-cardinality label the instructions call out to avoid).
      // One line per call during a sustained outage is accepted as a
      // reasonable tradeoff rather than building a bespoke log throttle.
      this.logger.warn("Redis unavailable for rate limiting - failing open (request not rate-limited)");
      return { limited: false, remaining: max, retryAfterSeconds: 0 };
    }
  }

  /**
   * Reads the current count without incrementing it - used where only
   * *failures* should count against the limit (e.g. change-password: a
   * correct current password must never move the counter). Callers
   * increment explicitly via checkAndIncrement() on the failure path.
   */
  async peek(key: string, max: number): Promise<RateLimitResult> {
    try {
      const client = this.redisService.getClient();
      const redisKey = `ratelimit:${key}`;
      const [countRaw, ttl] = await Promise.all([client.get(redisKey), client.ttl(redisKey)]);
      const count = countRaw ? Number(countRaw) : 0;
      const retryAfterSeconds = ttl > 0 ? ttl : 0;

      return {
        limited: count > max,
        remaining: Math.max(0, max - count),
        retryAfterSeconds,
      };
    } catch {
      this.logger.warn("Redis unavailable for rate limiting - failing open (request not rate-limited)");
      return { limited: false, remaining: max, retryAfterSeconds: 0 };
    }
  }

  /** Strict variants are reserved for privileged re-authentication. A
   * Redis outage must not silently remove brute-force protection from a
   * step-up boundary; the ordinary login path retains its documented DB
   * lockout-backed degradation policy. */
  async checkAndIncrementStrict(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
      return await this.checkAndIncrementOrThrow(key, max, windowSeconds);
    } catch {
      throw new RateLimitDependencyUnavailableError();
    }
  }

  async peekStrict(key: string, max: number): Promise<RateLimitResult> {
    try {
      const client = this.redisService.getClient();
      const redisKey = `ratelimit:${key}`;
      const [countRaw, ttl] = await Promise.all([client.get(redisKey), client.ttl(redisKey)]);
      const count = countRaw ? Number(countRaw) : 0;
      return {
        limited: count >= max,
        remaining: Math.max(0, max - count),
        retryAfterSeconds: ttl > 0 ? ttl : 0,
      };
    } catch {
      throw new RateLimitDependencyUnavailableError();
    }
  }

  private async checkAndIncrementOrThrow(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    const client = this.redisService.getClient();
    const redisKey = `ratelimit:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) await client.expire(redisKey, windowSeconds);
    const ttl = await client.ttl(redisKey);
    return {
      limited: count >= max,
      remaining: Math.max(0, max - count),
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }
}
