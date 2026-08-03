import { Test } from "@nestjs/testing";
import { HealthService } from "./health.service";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../common/redis/redis.service";

describe("HealthService (unit, PrismaService/RedisService mocked)", () => {
  async function buildService(isDatabaseHealthy: boolean, isRedisHealthy: boolean) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { isDatabaseHealthy: async () => isDatabaseHealthy } },
        { provide: RedisService, useValue: { isHealthy: async () => isRedisHealthy } },
      ],
    }).compile();

    return moduleRef.get(HealthService);
  }

  it("reports ready when both PostgreSQL and Redis are healthy", async () => {
    const service = await buildService(true, true);
    expect(await service.checkReadiness()).toEqual({ ready: true, checks: { database: "ok", redis: "ok" } });
  });

  it("reports not ready when PostgreSQL is unavailable", async () => {
    const service = await buildService(false, true);
    expect(await service.checkReadiness()).toEqual({ ready: false, checks: { database: "error", redis: "ok" } });
  });

  it("reports not ready when Redis is unavailable", async () => {
    const service = await buildService(true, false);
    expect(await service.checkReadiness()).toEqual({ ready: false, checks: { database: "ok", redis: "error" } });
  });

  it("reports not ready when both are unavailable", async () => {
    const service = await buildService(false, false);
    expect(await service.checkReadiness()).toEqual({ ready: false, checks: { database: "error", redis: "error" } });
  });
});
