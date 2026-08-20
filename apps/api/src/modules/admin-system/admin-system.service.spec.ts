import { AdminSystemService } from "./admin-system.service";
import type { PrismaService } from "../../database/prisma.service";
import type { RedisService } from "../../common/redis/redis.service";
import type { MasterHealthService } from "../master/health/master-health.service";

describe("AdminSystemService", () => {
  function harness() {
    const prisma = {
      isDatabaseHealthy: jest.fn().mockResolvedValue(true),
      $queryRaw: jest.fn().mockResolvedValue([{ migration_name: "20260819132100_notification_unknown_result" }]),
      notificationJob: {
        groupBy: jest.fn().mockResolvedValue([
          { status: "QUEUED", _count: { _all: 2 } },
          { status: "PROCESSING", _count: { _all: 1 } },
          { status: "RETRY_PENDING", _count: { _all: 3 } },
          { status: "FAILED", _count: { _all: 1 } },
          { status: "DEAD_LETTER", _count: { _all: 4 } },
          { status: "UNKNOWN_RESULT", _count: { _all: 2 } },
        ]),
      },
    };
    const redis = { isHealthy: jest.fn().mockResolvedValue(true) };
    const master = { check: jest.fn().mockResolvedValue({ status: "ok" }) };
    const service = new AdminSystemService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      master as unknown as MasterHealthService,
    );
    return { service, prisma, redis, master };
  }

  it("reports only live dependency and outbox values", async () => {
    const { service } = harness();
    const result = await service.getStatus();
    expect(result.dependencies).toEqual({
      postgres: expect.objectContaining({ status: "AVAILABLE" }),
      redis: expect.objectContaining({ status: "AVAILABLE" }),
      master: expect.objectContaining({ status: "AVAILABLE" }),
    });
    expect(result.notifications).toEqual({ status: "AVAILABLE", backlog: 6, failed: 7, deadLetter: 4 });
    expect(result.api.migrationVersion).toBe("20260819132100_notification_unknown_result");
    expect(result).not.toHaveProperty("errorRate");
  });

  it("distinguishes disabled Master as NOT_CONFIGURED", async () => {
    const { service, master } = harness();
    master.check.mockResolvedValue({ status: "disabled" });
    expect((await service.getStatus()).dependencies.master.status).toBe("NOT_CONFIGURED");
  });

  it("reports dependency failures honestly without throwing or leaking internals", async () => {
    const { service, prisma, redis, master } = harness();
    prisma.isDatabaseHealthy.mockRejectedValue(new Error("postgresql://secret@internal"));
    prisma.$queryRaw.mockRejectedValue(new Error("database unavailable"));
    redis.isHealthy.mockRejectedValue(new Error("redis://secret@internal"));
    master.check.mockRejectedValue(new Error("private-master:33051"));

    const serialized = JSON.stringify(await service.getStatus());
    const result = JSON.parse(serialized) as Awaited<ReturnType<AdminSystemService["getStatus"]>>;
    expect(result.dependencies.postgres.status).toBe("UNAVAILABLE");
    expect(result.dependencies.redis.status).toBe("UNAVAILABLE");
    expect(result.dependencies.master.status).toBe("UNAVAILABLE");
    expect(result.notifications).toEqual({ status: "UNKNOWN", backlog: null, failed: null, deadLetter: null });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private-master");
  });

  it("bounds a dependency that never settles", async () => {
    jest.useFakeTimers();
    try {
      const { service, prisma } = harness();
      prisma.isDatabaseHealthy.mockReturnValue(new Promise<boolean>(() => undefined));
      const pending = service.getStatus();
      await jest.advanceTimersByTimeAsync(3_001);
      expect((await pending).dependencies.postgres.status).toBe("UNAVAILABLE");
    } finally {
      jest.useRealTimers();
    }
  });
});
