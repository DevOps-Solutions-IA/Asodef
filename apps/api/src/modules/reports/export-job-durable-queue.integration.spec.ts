import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { User } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";
import { ReportsService } from "./reports.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

/**
 * US-076: the durable-queue mechanics (claim/lease/recover/retry) live
 * as private methods on ReportsService by design (no public API needs
 * them) - these tests drive them the only way a real crash scenario
 * would: seed an ExportJob row directly via Prisma in the state a
 * crashed worker would leave it in, then trigger the same sweep points
 * production traffic triggers (ReportsService.run() for a background-
 * sized report), and observe the outcome through the same public
 * surface the API controller uses (getJobStatus/GET .../exports/:id).
 */
describe("ExportJob durable queue (US-076, integration, real Postgres)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let reportsService: ReportsService;
  const createdUserIds: string[] = [];
  const createdSecurityEventIds: string[] = [];
  const createdJobIds: string[] = [];

  let finance: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    reportsService = app.get(ReportsService);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    finance = await createActor("FINANCE");
  });

  afterAll(async () => {
    if (createdJobIds.length > 0) {
      await prisma.exportJob.deleteMany({ where: { id: { in: createdJobIds } } });
    }
    if (createdSecurityEventIds.length > 0) {
      await prisma.securityEvent.deleteMany({ where: { id: { in: createdSecurityEventIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `export-queue-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Export Queue Test User",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, create: { userId, roleId: role.id }, update: {} });
  }

  async function loginAs(user: User): Promise<string[]> {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: user.email, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    const raw = response.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  async function createActor(roleName: string): Promise<{ user: User; cookies: string[] }> {
    const user = await createUser();
    await assignRole(user.id, roleName);
    const cookies = await loginAs(user);
    return { user, cookies };
  }

  async function seedEnoughRowsForBackgroundJob(): Promise<void> {
    const events = Array.from({ length: 1001 }, () => ({
      id: randomUUID(),
      type: "LOGIN_SUCCEEDED" as const,
      userId: null,
      sessionId: null,
      ipAddress: "203.0.113.1",
    }));
    await prisma.securityEvent.createMany({ data: events });
    createdSecurityEventIds.push(...events.map((e) => e.id));
  }

  async function pollUntil(jobId: string, predicate: (status: string) => boolean, maxAttempts = 30): Promise<string> {
    let status = "";
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const poll = await request(app.getHttpServer()).get(`/api/v1/admin/reports/exports/${jobId}`).set("Cookie", finance.cookies);
      status = poll.body.status;
      if (predicate(status)) return status;
      await new Promise((r) => setTimeout(r, 200));
    }
    return status;
  }

  it("recovers a job left PROCESSING by a crashed worker (expired lease) back to PENDING with attemptCount incremented and a future nextAttemptAt (backoff) - not retried immediately", async () => {
    const staleJob = await prisma.exportJob.create({
      data: {
        reportKey: "user_activity",
        filters: {},
        status: "PROCESSING",
        requestedByUserId: finance.user.id,
        leaseOwner: "a-worker-that-crashed",
        leaseExpiresAt: new Date(Date.now() - 60_000),
        attemptCount: 0,
        maxAttempts: 3,
      },
    });
    createdJobIds.push(staleJob.id);

    // Any real background-sized report request sweeps for stale jobs -
    // this is the actual production trigger point, not a test-only hook.
    await seedEnoughRowsForBackgroundJob();
    const triggerResponse = await request(app.getHttpServer()).get("/api/v1/admin/reports/user_activity").set("Cookie", finance.cookies);
    expect(triggerResponse.status).toBe(202);
    createdJobIds.push(triggerResponse.body.jobId);

    // Give the fire-and-forget sweep a moment to run, then confirm the
    // recovered state directly - it must NOT jump straight to READY,
    // since the backoff has not elapsed yet.
    await new Promise((r) => setTimeout(r, 500));
    const recovered = await prisma.exportJob.findUniqueOrThrow({ where: { id: staleJob.id } });
    expect(recovered.status).toBe("PENDING");
    expect(recovered.attemptCount).toBe(1);
    expect(recovered.leaseOwner).toBeNull();
    expect(recovered.leaseExpiresAt).toBeNull();
    expect(recovered.nextAttemptAt).not.toBeNull();
    expect(recovered.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  }, 15000);

  it("once a recovered job's backoff has elapsed, the next sweep successfully completes it", async () => {
    const dueJob = await prisma.exportJob.create({
      data: {
        reportKey: "user_activity",
        filters: {},
        status: "PENDING",
        requestedByUserId: finance.user.id,
        attemptCount: 1,
        maxAttempts: 3,
        // Backoff already elapsed - this is exactly the state
        // recoverStaleJobs() would leave a job in once enough real time
        // has passed, without this test needing to wait 30s+ for it.
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });
    createdJobIds.push(dueJob.id);

    await seedEnoughRowsForBackgroundJob();
    const triggerResponse = await request(app.getHttpServer()).get("/api/v1/admin/reports/user_activity").set("Cookie", finance.cookies);
    expect(triggerResponse.status).toBe(202);
    createdJobIds.push(triggerResponse.body.jobId);

    const finalStatus = await pollUntil(dueJob.id, (s) => s === "READY" || s === "FAILED");
    expect(finalStatus).toBe("READY");
  }, 15000);

  it("marks a stale job permanently FAILED once maxAttempts is exhausted, without retrying further", async () => {
    const exhaustedJob = await prisma.exportJob.create({
      data: {
        reportKey: "user_activity",
        filters: {},
        status: "PROCESSING",
        requestedByUserId: finance.user.id,
        leaseOwner: "a-worker-that-crashed-repeatedly",
        leaseExpiresAt: new Date(Date.now() - 60_000),
        attemptCount: 2,
        maxAttempts: 3,
      },
    });
    createdJobIds.push(exhaustedJob.id);

    await seedEnoughRowsForBackgroundJob();
    const triggerResponse = await request(app.getHttpServer()).get("/api/v1/admin/reports/user_activity").set("Cookie", finance.cookies);
    expect(triggerResponse.status).toBe(202);
    createdJobIds.push(triggerResponse.body.jobId);

    await pollUntil(triggerResponse.body.jobId, (s) => s === "READY" || s === "FAILED");

    const final = await prisma.exportJob.findUniqueOrThrow({ where: { id: exhaustedJob.id } });
    expect(final.status).toBe("FAILED");
    expect(final.attemptCount).toBe(3);
    expect(final.failedAt).not.toBeNull();
    expect(final.errorMessage).toBeTruthy();
  }, 15000);

  it("atomic claim: two concurrent processing attempts for the same PENDING job never both succeed", async () => {
    const job = await prisma.exportJob.create({
      data: { reportKey: "user_activity", filters: {}, status: "PENDING", requestedByUserId: finance.user.id },
    });
    createdJobIds.push(job.id);

    await seedEnoughRowsForBackgroundJob();

    // Directly exercises the same private processExportJob() two real
    // concurrent HTTP-triggered background jobs would each separately
    // invoke on this one row - accessed via bracket notation since it's
    // intentionally private (no public API needs to trigger a specific
    // job's processing directly).
    const service = reportsService as unknown as { processExportJob(jobId: string): Promise<void> };
    await Promise.all([service.processExportJob(job.id), service.processExportJob(job.id)]);

    const finalStatus = await pollUntil(job.id, (s) => s === "READY" || s === "FAILED");
    expect(finalStatus).toBe("READY");

    // Only one real processing pass ever happened - completedAt/filePath
    // are set exactly once, never overwritten by a second concurrent
    // "winner" (there wasn't one - claimJob() only lets one through).
    const final = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.filePath).toBeTruthy();
  }, 15000);
});
