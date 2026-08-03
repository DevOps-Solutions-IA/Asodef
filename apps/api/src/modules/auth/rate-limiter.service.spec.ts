import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { RateLimiterService } from "./rate-limiter.service";
import { RedisModule } from "../../common/redis/redis.module";
import { RedisService } from "../../common/redis/redis.service";
import { validateEnv } from "../../config/env.validation";

describe("RateLimiterService (real Redis)", () => {
  let service: RateLimiterService;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }), RedisModule],
      providers: [RateLimiterService],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    service = moduleRef.get(RateLimiterService);
    redisService = moduleRef.get(RedisService);
  });

  afterAll(async () => {
    await redisService.getClient().quit();
  });

  it("allows requests under the configured max", async () => {
    const key = `test-${randomUUID()}`;
    const result = await service.checkAndIncrement(key, 5, 60);
    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(4);
  });

  it("blocks once the configured max is exceeded within the window", async () => {
    const key = `test-${randomUUID()}`;
    let last;
    for (let i = 0; i < 4; i++) {
      last = await service.checkAndIncrement(key, 3, 60);
    }
    expect(last?.limited).toBe(true);
  });

  it("reports a positive retryAfterSeconds while the window is active", async () => {
    const key = `test-${randomUUID()}`;
    const result = await service.checkAndIncrement(key, 3, 60);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window expires", async () => {
    const key = `test-${randomUUID()}`;
    await service.checkAndIncrement(key, 1, 1); // window of 1 second, max 1
    const secondImmediately = await service.checkAndIncrement(key, 1, 1);
    expect(secondImmediately.limited).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const afterWindow = await service.checkAndIncrement(key, 1, 1);
    expect(afterWindow.limited).toBe(false);
  }, 10_000);

  it("fails open (never limits) when Redis is unavailable, rather than blocking every login", async () => {
    const brokenClient = { incr: jest.fn().mockRejectedValue(new Error("Redis connection lost")) };
    const brokenRedisService = { getClient: () => brokenClient } as unknown as RedisService;
    const resilientService = new RateLimiterService(brokenRedisService);

    const result = await resilientService.checkAndIncrement("any-key", 5, 60);

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(5);
  });

  describe("peek", () => {
    it("does not increment the counter (unlike checkAndIncrement)", async () => {
      const key = `test-${randomUUID()}`;
      const before = await service.peek(key, 5);
      expect(before.limited).toBe(false);
      expect(before.remaining).toBe(5);

      // Repeated peeks must never move the counter.
      await service.peek(key, 5);
      await service.peek(key, 5);
      const stillZero = await service.peek(key, 5);
      expect(stillZero.remaining).toBe(5);
    });

    it("reflects counts made by checkAndIncrement without adding its own", async () => {
      const key = `test-${randomUUID()}`;
      await service.checkAndIncrement(key, 5, 60);
      await service.checkAndIncrement(key, 5, 60);

      const peeked = await service.peek(key, 5);
      expect(peeked.remaining).toBe(3);

      const peekedAgain = await service.peek(key, 5);
      expect(peekedAgain.remaining).toBe(3); // unchanged - peek never increments
    });

    it("reports limited once checkAndIncrement has pushed the count past max", async () => {
      const key = `test-${randomUUID()}`;
      for (let i = 0; i < 4; i++) {
        await service.checkAndIncrement(key, 3, 60);
      }
      const peeked = await service.peek(key, 3);
      expect(peeked.limited).toBe(true);
    });

    it("fails open when Redis is unavailable", async () => {
      const brokenClient = { get: jest.fn().mockRejectedValue(new Error("Redis connection lost")), ttl: jest.fn() };
      const brokenRedisService = { getClient: () => brokenClient } as unknown as RedisService;
      const resilientService = new RateLimiterService(brokenRedisService);

      const result = await resilientService.peek("any-key", 5);

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(5);
    });
  });
});
