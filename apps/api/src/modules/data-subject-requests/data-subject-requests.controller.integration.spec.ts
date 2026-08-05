import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
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

function validPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "DELETION",
    requesterName: "Titular de Prueba",
    requesterEmail: `dsr-${randomUUID()}@example.com`,
    requesterDocument: "1000000099",
    description: "Solicito la eliminación de mis datos personales.",
    ...overrides,
  };
}

describe("Data-subject-requests endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];

  let admin: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    // Same convention as admin-users.controller.integration.spec.ts:
    // the login rate limit's 60s window is shared across every test
    // file in a full `pnpm test` run (same Redis, same loopback IP) -
    // clear it before this file's own logins so they never inherit an
    // already-strained budget from whatever ran just before it.
    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    admin = await createActor("ADMIN");
    noPermActor = await createActor("CUSTOMER");
  });

  beforeEach(async () => {
    // Supertest's in-process requests all resolve to the same loopback
    // IP, so every test's own createRequestViaApi call would otherwise
    // accumulate against the same rate-limit counter across this whole
    // file - clear it before each test so only the dedicated rate-limit
    // test below exercises the limit intentionally.
    const redisClient = app.get(RedisService).getClient();
    const keysToClear = await redisClient.keys("ratelimit:data-subject-requests:*");
    if (keysToClear.length > 0) {
      await redisClient.del(...keysToClear);
    }
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { dataSubjectRequestId: { in: createdRequestIds } } });
      await prisma.dataSubjectRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `dsr-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "DSR Test User",
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

  async function createRequestViaApi(payloadOverrides: Partial<Record<string, unknown>> = {}) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/data-subject-requests")
      .send(validPayload(payloadOverrides));
    expect(response.status).toBe(201);

    const row = await prisma.dataSubjectRequest.findUniqueOrThrow({ where: { publicReference: response.body.publicReference } });
    createdRequestIds.push(row.id);
    return { response, row };
  }

  it("Example (AC): submitting a deletion request returns a tracking reference", async () => {
    const { response } = await createRequestViaApi({ type: "DELETION" });

    expect(response.body.publicReference).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(response.body.status).toBe("RECEIVED");
    expect(response.body.type).toBe("DELETION");
    expect(response.body).not.toHaveProperty("id");
    expect(response.body).not.toHaveProperty("requesterEmail");
    expect(response.body).not.toHaveProperty("assignedUserId");
  });

  it("rejects an unknown request type with 400", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/data-subject-requests")
      .send(validPayload({ type: "NOT_A_REAL_TYPE" }));
    expect(response.status).toBe(400);
  });

  it("rate-limits repeated submissions from the same IP with a real 429, unlike the leads form's silent drop", async () => {
    const max = app
      .get<ConfigService<{ DATA_SUBJECT_REQUESTS_RATE_LIMIT_IP_MAX: number }, true>>(ConfigService)
      .get("DATA_SUBJECT_REQUESTS_RATE_LIMIT_IP_MAX", { infer: true });

    for (let i = 0; i < max; i++) {
      const response = await request(app.getHttpServer()).post("/api/v1/data-subject-requests").send(validPayload());
      expect(response.status).toBe(201);
      createdRequestIds.push((await prisma.dataSubjectRequest.findUniqueOrThrow({ where: { publicReference: response.body.publicReference } })).id);
    }

    const limited = await request(app.getHttpServer()).post("/api/v1/data-subject-requests").send(validPayload());
    expect(limited.status).toBe(429);
    expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("Example (AC): looking up by reference (public, no auth) shows current status without exposing other requesters' data", async () => {
    const { response: created } = await createRequestViaApi();
    const { response: otherCreated } = await createRequestViaApi({ requesterName: "Otro Titular" });

    const response = await request(app.getHttpServer()).get(`/api/v1/data-subject-requests/${created.body.publicReference}`);

    expect(response.status).toBe(200);
    expect(response.body.publicReference).toBe(created.body.publicReference);
    expect(response.body).not.toHaveProperty("requesterName");
    expect(response.body).not.toHaveProperty("id");
    expect(JSON.stringify(response.body)).not.toContain(otherCreated.body.publicReference);
  });

  it("returns a generic 404 for a non-existent reference (no information leakage)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/data-subject-requests/this-reference-does-not-exist");
    expect(response.status).toBe(404);
  });

  it("creates an audit trail entry for the creation event", async () => {
    const { row } = await createRequestViaApi();

    const entries = await prisma.auditLog.findMany({ where: { dataSubjectRequestId: row.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("data_subject_request.created");
    expect(entries[0]?.source).toBe("REQUEST_CREATE");
  });

  describe("admin authorization boundaries", () => {
    it("returns 403 for GET /admin/data-subject-requests without data.manage", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/admin/data-subject-requests").set("Cookie", noPermActor.cookies);
      expect(response.status).toBe(403);
    });

    it("returns 401 for the admin list endpoint with no session", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/admin/data-subject-requests");
      expect(response.status).toBe(401);
    });
  });

  describe("admin lifecycle", () => {
    it("Example (AC): draft -> identity verification -> review -> resolution produces a full audit trail", async () => {
      const { row } = await createRequestViaApi();

      const toIdentityVerification = await request(app.getHttpServer())
        .post(`/api/v1/admin/data-subject-requests/${row.id}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "IDENTITY_VERIFICATION", notes: "Iniciando verificación de identidad." });
      expect(toIdentityVerification.status).toBe(200);

      const verifyIdentity = await request(app.getHttpServer())
        .post(`/api/v1/admin/data-subject-requests/${row.id}/transition`)
        .set("Cookie", admin.cookies)
        .send({
          status: "IN_REVIEW",
          notes: "Identidad verificada con número de documento.",
          identityVerificationStatus: "verificado",
        });
      expect(verifyIdentity.status).toBe(200);
      expect(verifyIdentity.body.identityVerificationStatus).toBe("verificado");

      const resolve = await request(app.getHttpServer())
        .post(`/api/v1/admin/data-subject-requests/${row.id}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "RESOLVED", notes: "Datos eliminados según lo solicitado.", resolution: "Solicitud atendida y datos eliminados." });
      expect(resolve.status).toBe(200);
      expect(resolve.body.status).toBe("RESOLVED");
      expect(resolve.body.resolution).toBe("Solicitud atendida y datos eliminados.");

      const auditEntries = await prisma.auditLog.findMany({
        where: { dataSubjectRequestId: row.id },
        orderBy: { createdAt: "asc" },
      });
      expect(auditEntries.map((e) => e.newStatus)).toEqual(["RECEIVED", "IDENTITY_VERIFICATION", "IN_REVIEW", "RESOLVED"]);
      expect(auditEntries.every((e) => e.applied)).toBe(true);

      const publicLookup = await request(app.getHttpServer()).get(`/api/v1/data-subject-requests/${row.publicReference}`);
      expect(publicLookup.body.status).toBe("RESOLVED");
      expect(publicLookup.body.resolution).toBe("Solicitud atendida y datos eliminados.");
    });

    it("Negative case (AC): transitioning straight from RECEIVED to RESOLVED is rejected with a validation error", async () => {
      const { row } = await createRequestViaApi();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/data-subject-requests/${row.id}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "RESOLVED", notes: "Intentando resolver sin verificar identidad." });

      expect(response.status).toBe(400);

      const persisted = await prisma.dataSubjectRequest.findUniqueOrThrow({ where: { id: row.id } });
      expect(persisted.status).toBe("RECEIVED");
    });

    it("rejects a transition without notes with 400", async () => {
      const { row } = await createRequestViaApi();

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/data-subject-requests/${row.id}/transition`)
        .set("Cookie", admin.cookies)
        .send({ status: "IDENTITY_VERIFICATION" });

      expect(response.status).toBe(400);
    });

    it("assign() sets assignedUserId and is audited", async () => {
      const { row } = await createRequestViaApi();

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/data-subject-requests/${row.id}/assign`)
        .set("Cookie", admin.cookies)
        .send({ assignedUserId: admin.user.id });

      expect(response.status).toBe(200);
      expect(response.body.assignedUserId).toBe(admin.user.id);

      const auditEntry = await prisma.auditLog.findFirst({
        where: { dataSubjectRequestId: row.id, action: "data_subject_request.assigned" },
      });
      expect(auditEntry).not.toBeNull();
    });

    it("list() filters by status", async () => {
      const { row } = await createRequestViaApi();

      const response = await request(app.getHttpServer())
        .get("/api/v1/admin/data-subject-requests?status=RECEIVED")
        .set("Cookie", admin.cookies);

      expect(response.status).toBe(200);
      expect(response.body.items.some((item: { id: string }) => item.id === row.id)).toBe(true);
      expect(response.body.items.every((item: { status: string }) => item.status === "RECEIVED")).toBe(true);
    });
  });
});
