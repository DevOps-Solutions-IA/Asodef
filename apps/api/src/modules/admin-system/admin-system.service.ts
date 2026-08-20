import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NotificationStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { MasterHealthService } from "../master/health/master-health.service";
import { AdminIdentityInvariantService } from "../auth/admin-identity-invariant.service";
import type { EnvConfig } from "../../config/env.validation";
import { NotificationService } from "../notifications/notification.service";
import type { AdminSystemStatus, OperationalStatus } from "./admin-system.types";

const PROBE_TIMEOUT_MS = 3_000;
const UNKNOWN = "UNKNOWN" as const;
const BACKLOG_STATUSES: NotificationStatus[] = ["QUEUED", "PROCESSING", "RETRY_PENDING"];

interface MigrationRow {
  migration_name: string;
}

@Injectable()
export class AdminSystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly masterHealth: MasterHealthService,
    private readonly adminIdentityInvariant: AdminIdentityInvariantService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly notifications: NotificationService,
  ) {}

  async getStatus(): Promise<AdminSystemStatus> {
    const [postgres, redis, master, notificationTransport, operationalData] = await Promise.all([
      probe(() => this.prisma.isDatabaseHealthy()),
      probe(() => this.redis.isHealthy()),
      probe(() => this.masterHealth.check()),
      probe(() => this.notifications.checkTransportHealth()),
      withinTimeout(this.loadOperationalData(), PROBE_TIMEOUT_MS).catch(() => null),
    ]);

    const masterStatus: OperationalStatus = master.value == null
      ? "UNAVAILABLE"
      : master.value.status === "disabled"
        ? "NOT_CONFIGURED"
        : master.value.status === "ok"
          ? "AVAILABLE"
          : "UNAVAILABLE";
    const postgresAvailable = postgres.value === true;
    const redisAvailable = redis.value === true;
    const trustedOperationalData = postgresAvailable ? operationalData : null;
    const identityStatus = this.adminIdentityInvariant.getStatus().status;
    const smtpConfigured = this.config.get("SMTP_HOST", { infer: true }).trim().length > 0;
    const notificationTransportStatus: OperationalStatus = notificationTransport.value ?? "UNAVAILABLE";
    const notificationsAvailable = trustedOperationalData !== null;
    const coreHealthy = postgresAvailable && redisAvailable && identityStatus === "VERIFIED"
      && smtpConfigured && notificationTransportStatus === "AVAILABLE";
    const overallStatus = !coreHealthy
      ? "CORE_UNHEALTHY" as const
      : masterStatus === "AVAILABLE"
        ? "CORE_HEALTHY" as const
        : "DEGRADED_OPTIONAL_DEPENDENCY" as const;

    return {
      generatedAt: new Date().toISOString(),
      overallStatus,
      api: {
        status: "AVAILABLE",
        uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
        releaseSha: safeRuntimeIdentifier(process.env.APP_RELEASE_SHA ?? process.env.RELEASE_SHA),
        version: safeRuntimeIdentifier(process.env.APP_VERSION ?? process.env.npm_package_version),
        migrationVersion: trustedOperationalData?.migrationVersion ?? UNKNOWN,
      },
      dependencies: {
        postgres: { status: postgresAvailable ? "AVAILABLE" : "UNAVAILABLE", latencyMs: postgres.latencyMs },
        redis: { status: redisAvailable ? "AVAILABLE" : "UNAVAILABLE", latencyMs: redis.latencyMs },
        master: { status: masterStatus, latencyMs: master.latencyMs },
      },
      security: {
        status: identityStatus,
        recoveryChannel: identityStatus === "VERIFIED" ? "CONFIGURED" : "NOT_CONFIGURED",
        mfaRequired: this.config.get("ADMIN_MFA_REQUIRED", { infer: true }),
      },
      notifications: notificationsAvailable && trustedOperationalData
        ? {
            status: notificationTransportStatus,
            transport: smtpConfigured ? "SMTP" : "NOOP",
            transportConfigured: smtpConfigured,
            backlog: trustedOperationalData.backlog,
            queued: trustedOperationalData.queued,
            processing: trustedOperationalData.processing,
            retryPending: trustedOperationalData.retryPending,
            failed: trustedOperationalData.failed,
            unknownResult: trustedOperationalData.unknownResult,
            deadLetter: trustedOperationalData.deadLetter,
          }
        : {
            status: "UNAVAILABLE",
            transport: smtpConfigured ? "SMTP" : "NOOP",
            transportConfigured: smtpConfigured,
            backlog: null,
            queued: null,
            processing: null,
            retryPending: null,
            failed: null,
            unknownResult: null,
            deadLetter: null,
          },
    };
  }

  private async loadOperationalData(): Promise<{
    migrationVersion: string | "UNKNOWN";
    backlog: number;
    queued: number;
    processing: number;
    retryPending: number;
    failed: number;
    unknownResult: number;
    deadLetter: number;
  }> {
    const [migrations, groupedJobs] = await Promise.all([
      this.prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY finished_at DESC
        LIMIT 1
      `,
      this.prisma.notificationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const counts = new Map(groupedJobs.map((row) => [row.status, row._count._all]));
    const count = (status: NotificationStatus): number => counts.get(status) ?? 0;
    const deadLetter = count("DEAD_LETTER");
    return {
      migrationVersion: migrations[0]?.migration_name ?? UNKNOWN,
      backlog: BACKLOG_STATUSES.reduce((total, status) => total + count(status), 0),
      queued: count("QUEUED"),
      processing: count("PROCESSING"),
      retryPending: count("RETRY_PENDING"),
      failed: count("FAILED"),
      unknownResult: count("UNKNOWN_RESULT"),
      deadLetter,
    };
  }
}

async function probe<T>(operation: () => Promise<T>): Promise<{ value: T | null; latencyMs: number }> {
  const started = Date.now();
  try {
    return { value: await withinTimeout(operation(), PROBE_TIMEOUT_MS), latencyMs: Date.now() - started };
  } catch {
    return { value: null, latencyMs: Date.now() - started };
  }
}

function withinTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("DEPENDENCY_TIMEOUT")), timeoutMs);
    timeout.unref?.();
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}

function safeRuntimeIdentifier(value: string | undefined): string | "UNKNOWN" {
  if (!value) return UNKNOWN;
  const normalized = value.trim();
  return /^[A-Za-z0-9._-]{1,128}$/.test(normalized) ? normalized : UNKNOWN;
}
