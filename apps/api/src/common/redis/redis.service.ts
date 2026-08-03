import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { EnvConfig } from "../../config/env.validation";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.client = new Redis(configService.get("REDIS_URL", { infer: true }), {
      lazyConnect: true,
      // A single command retry is enough to keep health checks/requests
      // fast-failing during an outage; retryStrategy below is the separate
      // *connection*-level backoff that keeps the client trying to
      // reconnect in the background so service recovers automatically once
      // Redis comes back, without requiring a process restart.
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
    this.client.on("error", (error) => {
      this.logger.error("Redis client error", error instanceof Error ? error.stack : undefined);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const reply = await this.client.ping();
      return reply === "PONG";
    } catch (error) {
      this.logger.error("Redis health check failed", error instanceof Error ? error.stack : undefined);
      return false;
    }
  }
}
