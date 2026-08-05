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

describe("Companies admin endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdCompanyIds: string[] = [];

  let commercial: { user: User; cookies: string[] };
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

    // COMMERCIAL is the only seeded non-admin role holding companies.read
    // (rbac-catalog.ts: AUDITOR does not).
    commercial = await createActor("COMMERCIAL");
    noPermActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdCompanyIds.length > 0) {
      await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `companies-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Companies Test User",
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

  async function createCompany() {
    const company = await prisma.company.create({
      data: {
        name: "Empresa Afiliada de Prueba",
        nit: `900${randomUUID().slice(0, 6)}-${Math.floor(Math.random() * 10)}`,
        contactName: "Contacto de Prueba",
        contactEmail: `companies-${randomUUID()}@example.com`,
        sector: "Servicios",
      },
    });
    createdCompanyIds.push(company.id);
    return company;
  }

  it("returns 403 without companies.read", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/companies").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("lists companies for an actor holding companies.read (COMMERCIAL)", async () => {
    const company = await createCompany();

    const response = await request(app.getHttpServer()).get("/api/v1/admin/companies").set("Cookie", commercial.cookies);
    expect(response.status).toBe(200);
    expect(response.body.some((c: { id: string }) => c.id === company.id)).toBe(true);
  });

  it("returns a company's detail with related-record counts", async () => {
    const company = await createCompany();

    const response = await request(app.getHttpServer()).get(`/api/v1/admin/companies/${company.id}`).set("Cookie", commercial.cookies);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(company.id);
    expect(response.body.opportunityCount).toBe(0);
    expect(response.body.agreementCount).toBe(0);
    expect(response.body.contractCount).toBe(0);
  });

  it("returns 404 for a nonexistent company id", async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/admin/companies/${randomUUID()}`).set("Cookie", commercial.cookies);
    expect(response.status).toBe(404);
  });
});
