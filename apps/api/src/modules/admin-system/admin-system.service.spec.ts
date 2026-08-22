import { AdminSystemService } from "./admin-system.service";
import type { PrismaService } from "../../database/prisma.service";
import type { RedisService } from "../../common/redis/redis.service";
import type { MasterHealthService } from "../master/health/master-health.service";
import type { AdminIdentityInvariantService } from "../auth/admin-identity-invariant.service";
import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { NotificationService } from "../notifications/notification.service";

describe("AdminSystemService", () => {
  function harness() {
    const prisma = {
      isDatabaseHealthy: jest.fn().mockResolvedValue(true),
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { migration_name: "20260819132100_notification_unknown_result" },
        ]),
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
    const identity = {
      getStatus: jest
        .fn()
        .mockReturnValue({
          status: "VERIFIED",
          verifiedAt: new Date().toISOString(),
        }),
    };
    const env = {
      SMTP_HOST: "smtp.example.test",
      ADMIN_MFA_REQUIRED: false,
      BOLD_MODE: "sandbox",
      BOLD_IDENTITY_KEY: "identity",
      BOLD_SECRET_KEY: "secret",
    };
    const config = { get: jest.fn((key: keyof typeof env) => env[key]) };
    const notifications = {
      checkTransportHealth: jest.fn().mockResolvedValue("AVAILABLE"),
    };
    const service = new AdminSystemService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      master as unknown as MasterHealthService,
      identity as unknown as AdminIdentityInvariantService,
      config as unknown as ConfigService<EnvConfig, true>,
      notifications as unknown as NotificationService,
    );
    return { service, prisma, redis, master, identity, env, notifications };
  }

  it("reports only live dependency and outbox values", async () => {
    const { service } = harness();
    const result = await service.getStatus();
    expect(result.services).toEqual({
      postgres: expect.objectContaining({
        state: "HEALTHY",
        criticality: "CORE",
      }),
      redis: expect.objectContaining({ state: "HEALTHY", criticality: "CORE" }),
    });
    expect(result.integrations.master).toEqual(
      expect.objectContaining({ state: "HEALTHY", criticality: "OPTIONAL" }),
    );
    expect(result.core.state).toBe("HEALTHY");
    expect(result.security).toEqual({
      state: "HEALTHY",
      recoveryChannel: "CONFIGURED",
      mfaRequired: false,
    });
    expect(result.notifications).toEqual({
      queueState: "DEGRADED",
      transportState: "HEALTHY",
      transport: "SMTP",
      transportConfigured: true,
      backlog: 6,
      queued: 2,
      processing: 1,
      retryPending: 3,
      failed: 1,
      unknownResult: 2,
      deadLetter: 4,
    });
    expect(result.api.migrationVersion).toBe(
      "20260819132100_notification_unknown_result",
    );
    expect(result).not.toHaveProperty("errorRate");
  });

  it("keeps disabled Master distinct and does not degrade the administrative core", async () => {
    const { service, master } = harness();
    master.check.mockResolvedValue({ status: "disabled" });
    const result = await service.getStatus();
    expect(result.integrations.master.state).toBe("DISABLED");
    expect(result.core.state).toBe("HEALTHY");
  });

  it("reports missing SMTP configuration without declaring the administrative core down", async () => {
    const { service, env, notifications } = harness();
    env.SMTP_HOST = "";
    notifications.checkTransportHealth.mockResolvedValue("NOT_CONFIGURED");
    const result = await service.getStatus();
    expect(result.core.state).toBe("HEALTHY");
    expect(result.integrations.smtp.state).toBe("NOT_CONFIGURED");
    expect(result.notifications).toEqual(
      expect.objectContaining({
        transportState: "NOT_CONFIGURED",
        transport: "NOOP",
        transportConfigured: false,
      }),
    );
  });

  it("reports configured but unreachable SMTP as unavailable while the queue remains independently observable", async () => {
    const { service, notifications } = harness();
    notifications.checkTransportHealth.mockResolvedValue("UNAVAILABLE");
    const result = await service.getStatus();
    expect(result.core.state).toBe("HEALTHY");
    expect(result.integrations.smtp.state).toBe("UNAVAILABLE");
    expect(result.notifications).toEqual(
      expect.objectContaining({
        queueState: "DEGRADED",
        transportState: "UNAVAILABLE",
        transport: "SMTP",
        transportConfigured: true,
      }),
    );
  });

  it("does not infer healthy transport from zero notification metrics", async () => {
    const { service, prisma, notifications } = harness();
    prisma.notificationJob.groupBy.mockResolvedValue([]);
    notifications.checkTransportHealth.mockResolvedValue("UNAVAILABLE");
    const result = await service.getStatus();
    expect(result.notifications.queueState).toBe("HEALTHY");
    expect(result.notifications.backlog).toBe(0);
    expect(result.notifications.transportState).toBe("UNAVAILABLE");
    expect(result.integrations.smtp.state).toBe("UNAVAILABLE");
    expect(result.core.state).toBe("HEALTHY");
  });

  it("reports an unverified administrative identity as core unhealthy without exposing identity data", async () => {
    const { service, identity } = harness();
    identity.getStatus.mockReturnValue({
      status: "NOT_VERIFIED",
      verifiedAt: null,
    });
    const result = await service.getStatus();
    expect(result.core.state).toBe("DEGRADED");
    expect(result.security).toEqual(
      expect.objectContaining({
        state: "DEGRADED",
        recoveryChannel: "NOT_CONFIGURED",
      }),
    );
  });

  it("reports dependency failures honestly without throwing or leaking internals", async () => {
    const { service, prisma, redis, master } = harness();
    prisma.isDatabaseHealthy.mockRejectedValue(
      new Error("postgresql://secret@internal"),
    );
    prisma.$queryRaw.mockRejectedValue(new Error("database unavailable"));
    redis.isHealthy.mockRejectedValue(new Error("redis://secret@internal"));
    master.check.mockRejectedValue(new Error("private-master:33051"));

    const serialized = JSON.stringify(await service.getStatus());
    const result = JSON.parse(serialized) as Awaited<
      ReturnType<AdminSystemService["getStatus"]>
    >;
    expect(result.services.postgres.state).toBe("UNAVAILABLE");
    expect(result.services.redis.state).toBe("UNAVAILABLE");
    expect(result.integrations.master.state).toBe("UNKNOWN");
    expect(result.core.state).toBe("UNAVAILABLE");
    expect(result.notifications).toEqual(
      expect.objectContaining({
        queueState: "UNKNOWN",
        backlog: null,
        failed: null,
        unknownResult: null,
        deadLetter: null,
      }),
    );
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private-master");
  });

  it("bounds a dependency that never settles", async () => {
    jest.useFakeTimers();
    try {
      const { service, prisma } = harness();
      prisma.isDatabaseHealthy.mockReturnValue(
        new Promise<boolean>(() => undefined),
      );
      const pending = service.getStatus();
      await jest.advanceTimersByTimeAsync(3_001);
      expect((await pending).services.postgres.state).toBe("UNAVAILABLE");
    } finally {
      jest.useRealTimers();
    }
  });
});
