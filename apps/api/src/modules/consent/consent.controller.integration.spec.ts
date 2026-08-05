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
import { seedConsentPurposes } from "../../database/seed-consent-purposes";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Admin consent-records endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdCustomerIds: string[] = [];

  let customerService: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    await seedConsentPurposes(prisma);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    customerService = await createActor("CUSTOMER_SERVICE");
    noPermActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
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
        email: `consent-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Consent Test User",
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

  async function createCustomerWithConsent() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `consent-search-${randomUUID()}`,
        fullName: "Cliente Búsqueda de Consentimiento",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "optional_marketing" } });
    const record = await prisma.consentRecord.create({
      data: {
        consentPurposeId: purpose.id,
        customerId: customer.id,
        status: "GRANTED",
        source: "test",
        acceptanceMethod: "explicit_action",
        ipAddress: "203.0.113.9",
        userAgent: "vitest-agent",
      },
    });

    return { customer, record };
  }

  it("returns 403 without data.manage", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/consent-records").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("Example (AC): searches consent records by subject and returns full evidence", async () => {
    const { customer, record } = await createCustomerWithConsent();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/consent-records?subjectType=customer&subjectId=${customer.id}`)
      .set("Cookie", customerService.cookies);

    expect(response.status).toBe(200);
    expect(response.body.items.some((r: { id: string }) => r.id === record.id)).toBe(true);
    const found = response.body.items.find((r: { id: string }) => r.id === record.id);
    expect(found.purposeKey).toBe("optional_marketing");
    expect(found.subjectType).toBe("customer");
    expect(found.subjectId).toBe(customer.id);
    expect(found.ipAddress).toBe("203.0.113.9");
    expect(found.acceptanceMethod).toBe("explicit_action");
  });

  it("searches consent records by purpose", async () => {
    const { record } = await createCustomerWithConsent();

    const response = await request(app.getHttpServer())
      .get("/api/v1/admin/consent-records?purposeKey=optional_marketing")
      .set("Cookie", customerService.cookies);

    expect(response.status).toBe(200);
    expect(response.body.items.some((r: { id: string }) => r.id === record.id)).toBe(true);
  });

  it("returns full detail for a single consent record", async () => {
    const { record } = await createCustomerWithConsent();

    const response = await request(app.getHttpServer()).get(`/api/v1/admin/consent-records/${record.id}`).set("Cookie", customerService.cookies);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(record.id);
    expect(response.body.ipAddress).toBe("203.0.113.9");
    expect(response.body.userAgent).toBe("vitest-agent");
    expect(response.body.acceptanceMethod).toBe("explicit_action");
  });

  it("returns 404 for a nonexistent consent record id", async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/admin/consent-records/${randomUUID()}`).set("Cookie", customerService.cookies);
    expect(response.status).toBe(404);
  });
});
