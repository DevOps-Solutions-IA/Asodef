import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../common/redis/redis.service";

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: "ok" | "error";
    redis: "ok" | "error";
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async checkReadiness(): Promise<ReadinessResult> {
    const [databaseHealthy, redisHealthy] = await Promise.all([
      this.prisma.isDatabaseHealthy(),
      this.redis.isHealthy(),
    ]);

    return {
      ready: databaseHealthy && redisHealthy,
      checks: {
        database: databaseHealthy ? "ok" : "error",
        redis: redisHealthy ? "ok" : "error",
      },
    };
  }
}
