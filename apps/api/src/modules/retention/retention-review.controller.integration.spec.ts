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

describe("Retention review endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdLeadIds: string[] = [];

  let admin: { user: User; cookies: string[] };
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

    admin = await createActor("ADMIN");
    noPermActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    // Always restore the LEADS policy to its seeded, inert state -
    // this table is shared with the live review environment.
    await prisma.retentionPolicy.update({
      where: { recordCategory: "LEADS" },
      data: { retentionPeriodDays: null, legalHold: false },
    });
    if (createdLeadIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { leadSubmissionId: { in: createdLeadIds } } });
      await prisma.anonymizationLog.deleteMany({ where: { recordCategory: "LEADS", recordId: { in: createdLeadIds } } });
      await prisma.leadNotification.deleteMany({ where: { leadSubmissionId: { in: createdLeadIds } } });
      await prisma.leadSubmission.deleteMany({ where: { id: { in: createdLeadIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `retention-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Retention Test User",
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

  async function createOldLead(daysOld: number) {
    const createdAt = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const lead = await prisma.leadSubmission.create({
      data: {
        fullName: "Titular Antiguo de Prueba",
        company: "Empresa de Prueba",
        position: "Gerente",
        city: "Cali",
        phone: "3000000000",
        email: `retention-lead-${randomUUID()}@example.com`,
        sector: "Servicios",
        message: "Mensaje de prueba de retención.",
        consentAccepted: true,
        createdAt,
      },
    });
    createdLeadIds.push(lead.id);
    return lead;
  }

  it("returns 403 without retention.manage", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/retention/review").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("reports 'not_configured' for a category with no retentionPeriodDays set", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/retention/review").set("Cookie", admin.cookies);
    expect(response.status).toBe(200);

    const documents = response.body.find((entry: { category: string }) => entry.category === "DOCUMENTS");
    expect(documents.status).toBe("not_configured");

    const opportunities = response.body.find((entry: { category: string }) => entry.category === "OPPORTUNITIES");
    expect(opportunities.status).toBe("not_configured");
  });

  it("reports 'not_yet_available' for a configured category with no underlying model yet (DOCUMENTS)", async () => {
    await prisma.retentionPolicy.update({ where: { recordCategory: "DOCUMENTS" }, data: { retentionPeriodDays: 30 } });
    try {
      const response = await request(app.getHttpServer()).get("/api/v1/admin/retention/review").set("Cookie", admin.cookies);
      const documents = response.body.find((entry: { category: string }) => entry.category === "DOCUMENTS");
      expect(documents.status).toBe("not_yet_available");
    } finally {
      await prisma.retentionPolicy.update({ where: { recordCategory: "DOCUMENTS" }, data: { retentionPeriodDays: null } });
    }
  });

  describe("with a configured LEADS retention window", () => {
    afterEach(async () => {
      await prisma.retentionPolicy.update({ where: { recordCategory: "LEADS" }, data: { retentionPeriodDays: null, legalHold: false } });
    });

    it("Example (AC): flags a record older than its configured window for review, without deleting it", async () => {
      await prisma.retentionPolicy.update({ where: { recordCategory: "LEADS" }, data: { retentionPeriodDays: 30 } });
      const oldLead = await createOldLead(45);

      const response = await request(app.getHttpServer()).get("/api/v1/admin/retention/review").set("Cookie", admin.cookies);

      const leadsResult = response.body.find((entry: { category: string }) => entry.category === "LEADS");
      expect(leadsResult.status).toBe("reviewed");
      expect(leadsResult.candidates.some((c: { recordId: string }) => c.recordId === oldLead.id)).toBe(true);

      const stillExists = await prisma.leadSubmission.findUnique({ where: { id: oldLead.id } });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.fullName).toBe("Titular Antiguo de Prueba");
    });

    it("does not flag a record younger than its configured window", async () => {
      await prisma.retentionPolicy.update({ where: { recordCategory: "LEADS" }, data: { retentionPeriodDays: 30 } });
      const recentLead = await createOldLead(5);

      const response = await request(app.getHttpServer()).get("/api/v1/admin/retention/review").set("Cookie", admin.cookies);

      const leadsResult = response.body.find((entry: { category: string }) => entry.category === "LEADS");
      expect(leadsResult.candidates.some((c: { recordId: string }) => c.recordId === recentLead.id)).toBe(false);
    });

    it("Negative case (AC): a category under legal hold is excluded even with old records past its window", async () => {
      await prisma.retentionPolicy.update({ where: { recordCategory: "LEADS" }, data: { retentionPeriodDays: 30, legalHold: true } });
      const oldLead = await createOldLead(45);

      const response = await request(app.getHttpServer()).get("/api/v1/admin/retention/review").set("Cookie", admin.cookies);

      const leadsResult = response.body.find((entry: { category: string }) => entry.category === "LEADS");
      expect(leadsResult.status).toBe("legal_hold");
      expect(leadsResult.candidates).toHaveLength(0);
      expect(leadsResult.candidates.some((c: { recordId: string }) => c.recordId === oldLead.id)).toBe(false);
    });

    it("execute() anonymizes the LEADS record and writes an AnonymizationLog entry as evidence", async () => {
      await prisma.retentionPolicy.update({ where: { recordCategory: "LEADS" }, data: { retentionPeriodDays: 30 } });
      const oldLead = await createOldLead(45);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/retention/LEADS/${oldLead.id}/execute`)
        .set("Cookie", admin.cookies)
        .send({ reason: "Fuera del período de retención configurado - prueba de verificación." });

      expect(response.status).toBe(200);
      expect(response.body.action).toBe("ANONYMIZED");
      expect(response.body.actorUserId).toBe(admin.user.id);

      const anonymized = await prisma.leadSubmission.findUniqueOrThrow({ where: { id: oldLead.id } });
      expect(anonymized.fullName).toBe("[ANONIMIZADO]");
      expect(anonymized.email).not.toContain("@example.com");

      const logEntry = await prisma.anonymizationLog.findFirst({ where: { recordCategory: "LEADS", recordId: oldLead.id } });
      expect(logEntry).not.toBeNull();
      expect(logEntry?.action).toBe("ANONYMIZED");
    });

    it("execute() rejects a category under legal hold", async () => {
      await prisma.retentionPolicy.update({ where: { recordCategory: "LEADS" }, data: { retentionPeriodDays: 30, legalHold: true } });
      const oldLead = await createOldLead(45);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/retention/LEADS/${oldLead.id}/execute`)
        .set("Cookie", admin.cookies)
        .send({ reason: "Intento bajo retención legal." });

      expect(response.status).toBe(409);

      const stillReal = await prisma.leadSubmission.findUniqueOrThrow({ where: { id: oldLead.id } });
      expect(stillReal.fullName).toBe("Titular Antiguo de Prueba");
    });

    it("execute() rejects a category with no configured retention period", async () => {
      const oldLead = await createOldLead(45);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/retention/LEADS/${oldLead.id}/execute`)
        .set("Cookie", admin.cookies)
        .send({ reason: "Sin período configurado." });

      expect(response.status).toBe(400);
    });
  });

  it("execute() rejects a category with no anonymization transform implemented", async () => {
    await prisma.retentionPolicy.update({ where: { recordCategory: "RECEIPTS" }, data: { retentionPeriodDays: 30 } });
    try {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/retention/RECEIPTS/${randomUUID()}/execute`)
        .set("Cookie", admin.cookies)
        .send({ reason: "Prueba de categoría no implementada." });

      expect(response.status).toBe(400);
    } finally {
      await prisma.retentionPolicy.update({ where: { recordCategory: "RECEIPTS" }, data: { retentionPeriodDays: null } });
    }
  });

  it("rejects an unknown category on the URL with 400", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/retention/NOT_A_REAL_CATEGORY/${randomUUID()}/execute`)
      .set("Cookie", admin.cookies)
      .send({ reason: "Categoría inválida." });
    expect(response.status).toBe(400);
  });
});
