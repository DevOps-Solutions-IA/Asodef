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
import { upsertActivePlanDemo } from "../../database/seed-payments";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Admin dashboard endpoint (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdCustomerIds: string[] = [];

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
    if (createdCustomerIds.length > 0) {
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `dashboard-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Dashboard Test User",
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

  it("returns 403 for a self-service role (CUSTOMER) even though it holds payments.read", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/dashboard").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("Example (AC): creating a new PENDING obligation increases obligacionesPendientes by exactly one", async () => {
    const before = await request(app.getHttpServer()).get("/api/v1/admin/dashboard").set("Cookie", finance.cookies);
    expect(before.status).toBe(200);
    const beforeCount = before.body.obligacionesPendientes;

    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `dashboard-test-${randomUUID()}`,
        fullName: "Cliente Dashboard de Prueba",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await upsertActivePlanDemo(prisma);
    await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Cuota dashboard de prueba",
        amountCents: 100_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const after = await request(app.getHttpServer()).get("/api/v1/admin/dashboard").set("Cookie", finance.cookies);
    expect(after.status).toBe(200);
    expect(after.body.obligacionesPendientes).toBe(beforeCount + 1);
  });

  it("returns every AC-listed metric as a real number/object, never undefined", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/dashboard").set("Cookie", finance.cookies);
    expect(response.status).toBe(200);

    const numericFields = [
      "newProspects30d",
      "conversionRate",
      "activeCompanies",
      "activeAgreements",
      "contractsPendingSignature",
      "contractsNearingExpiration",
      "commercialActivities30d",
      "leadsWithoutFollowUp",
      "opportunitiesWon",
      "opportunitiesLost",
      "recaudoDiarioCents",
      "recaudoMensualCents",
      "pagosAprobados",
      "pagosPendientes",
      "pagosRechazados",
      "tasaAprobacion",
      "obligacionesPendientes",
      "obligacionesVencidas",
      "reconciliationDifferencesOpen",
    ];
    for (const field of numericFields) {
      expect(typeof response.body[field]).toBe("number");
    }
    expect(typeof response.body.opportunitiesByStage).toBe("object");
  });
});
