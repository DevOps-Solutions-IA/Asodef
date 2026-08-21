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

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Admin reports endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdSecurityEventIds: string[] = [];
  const createdJobIds: string[] = [];

  let finance: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    finance = await createActor("FINANCE");
    noPermActor = await createActor("CUSTOMER");
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
        email: `reports-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Reports Test User",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
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

  it("returns 403 for an actor without reports.read", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/reports").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("lists all 10 literal report types from the AC's own enumeration", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/reports").set("Cookie", finance.cookies);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(10);
    const keys = response.body.map((r: { key: string }) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "payments",
        "collection_totals",
        "outstanding_obligations",
        "transactions_by_provider",
        "refunds",
        "reconciliation_differences",
        "companies_and_partners",
        "contract_expiration",
        "user_activity",
        "audit_events",
      ]),
    );
  });

  it("Negative case (AC): a report with zero matching records returns a valid empty-but-well-formed JSON response", async () => {
    const farFuture = "2099-01-01";
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/reports/payments?dateFrom=${farFuture}`)
      .set("Cookie", finance.cookies);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it("Negative case (AC): a report with zero matching records returns a valid empty-but-well-formed CSV (header row only)", async () => {
    const farFuture = "2099-01-01";
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/reports/payments?dateFrom=${farFuture}&format=csv`)
      .set("Cookie", finance.cookies);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.text.trim().split("\r\n")).toHaveLength(1);
    expect(response.text).toContain("Referencia");
  });

  it("runs the audit_events report and returns real rows", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/reports/audit_events").set("Cookie", finance.cookies);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  it("rejects an unknown report key", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/reports/not_a_real_report").set("Cookie", finance.cookies);
    expect(response.status).toBe(400);
  });

  it("Example (AC): >1000 matching rows runs as a background job with a downloadable-when-ready state", async () => {
    // Seed enough SecurityEvent rows (no FKs required) to cross the
    // 1000-row background-job threshold for real, rather than mocking it.
    // Give this fixture an exact, test-owned timestamp and run the report
    // through its real date filters. Without that isolation the export also
    // processes every historical SecurityEvent left in a developer database,
    // so runtime and assertions depend on unrelated local data volume.
    const isolatedCreatedAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    const events = Array.from({ length: 1001 }, () => ({
      id: randomUUID(),
      type: "LOGIN_SUCCEEDED" as const,
      userId: null,
      sessionId: null,
      ipAddress: "203.0.113.1",
      createdAt: isolatedCreatedAt,
    }));
    await prisma.securityEvent.createMany({ data: events });
    createdSecurityEventIds.push(...events.map((e) => e.id));

    const fixtureTimestamp = encodeURIComponent(isolatedCreatedAt.toISOString());
    const started = await request(app.getHttpServer())
      .get(`/api/v1/admin/reports/user_activity?dateFrom=${fixtureTimestamp}&dateTo=${fixtureTimestamp}`)
      .set("Cookie", finance.cookies);
    expect(started.status).toBe(202);
    expect(started.body.jobId).toBeTruthy();
    expect(started.body.status).toBe("PENDING");
    expect(started.body.rowCount).toBe(events.length);
    createdJobIds.push(started.body.jobId);

    let status = "PENDING";
    let attempts = 0;
    while (status !== "READY" && attempts < 30) {
      await new Promise((r) => setTimeout(r, 200));
      const poll = await request(app.getHttpServer()).get(`/api/v1/admin/reports/exports/${started.body.jobId}`).set("Cookie", finance.cookies);
      status = poll.body.status;
      attempts += 1;
    }
    expect(status).toBe("READY");

    const downloadResponse = await request(app.getHttpServer()).get(`/api/v1/admin/reports/exports/${started.body.jobId}/download`).set("Cookie", finance.cookies);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.text.split("\r\n").length).toBeGreaterThan(1000);
  }, 15000);
});
