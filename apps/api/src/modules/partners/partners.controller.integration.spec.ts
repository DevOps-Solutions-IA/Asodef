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

describe("Business partner endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdPartnerIds: string[] = [];

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
    if (createdPartnerIds.length > 0) {
      await prisma.businessPartner.deleteMany({ where: { id: { in: createdPartnerIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `partner-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Partner Test User",
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

  function samplePayload() {
    return {
      legalName: "Aliado Comercial de Prueba S.A.S.",
      tradeName: "Aliado de Prueba",
      nit: `900${randomUUID().slice(0, 6)}-1`,
      sector: "Salud",
      city: "Cali",
      address: "Calle Falsa 123",
      phone: "3000000000",
      corporateEmail: `partner-${randomUUID()}@example.com`,
      agreementType: "Descuento directo",
      benefitsOffered: { descripcion: "10% de descuento en consulta" },
    };
  }

  async function createPartner() {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/partners")
      .set("Cookie", admin.cookies)
      .send(samplePayload());
    expect(response.status).toBe(201);
    createdPartnerIds.push(response.body.id);
    return response.body;
  }

  it("returns 403 creating a partner without partners.manage", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/admin/partners").set("Cookie", noPermActor.cookies).send(samplePayload());
    expect(response.status).toBe(403);
  });

  it("creates a BusinessPartner with all gate checks defaulting to false and publicationStatus UNPUBLISHED", async () => {
    const partner = await createPartner();
    expect(partner.publicationStatus).toBe("UNPUBLISHED");
    expect(partner.status).toBe("PROSPECT");
    expect(partner.legalValidationConfirmed).toBe(false);
    expect(partner.commercialValidationConfirmed).toBe(false);
    expect(partner.benefitConfirmed).toBe(false);
    expect(partner.agreementValidityConfirmed).toBe(false);
    expect(partner.logoAuthorizationConfirmed).toBe(false);
    expect(partner.contactConfirmed).toBe(false);
    expect(partner.coverageConfirmed).toBe(false);
  });

  it("does not appear on the public endpoint before publishing", async () => {
    const partner = await createPartner();
    const publicList = await request(app.getHttpServer()).get("/api/v1/partners");
    expect(publicList.status).toBe(200);
    expect(publicList.body.some((p: { id: string }) => p.id === partner.id)).toBe(false);
  });

  it("Negative case (AC): a partner missing coverage confirmation cannot be published, and the response names that specific check", async () => {
    const partner = await createPartner();

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/partners/${partner.id}/checks`)
      .set("Cookie", admin.cookies)
      .send({
        legalValidationConfirmed: true,
        commercialValidationConfirmed: true,
        benefitConfirmed: true,
        agreementValidityConfirmed: true,
        logoAuthorizationConfirmed: true,
        contactConfirmed: true,
        // coverageConfirmed deliberately omitted
      });

    const response = await request(app.getHttpServer()).post(`/api/v1/admin/partners/${partner.id}/publish`).set("Cookie", admin.cookies);

    expect(response.status).toBe(409);
    expect(response.body.message).toEqual(expect.stringContaining("cobertura"));
  });

  it("US-065: each of the 7 gate checks individually blocks publication when it alone is missing (AC's own text says 6, the literal enumerated list has 7 - same flagged inconsistency as US-053)", async () => {
    const allChecks = {
      legalValidationConfirmed: true,
      commercialValidationConfirmed: true,
      benefitConfirmed: true,
      agreementValidityConfirmed: true,
      logoAuthorizationConfirmed: true,
      contactConfirmed: true,
      coverageConfirmed: true,
    };

    for (const omittedCheck of Object.keys(allChecks)) {
      const partner = await createPartner();
      const checksWithOneMissing = { ...allChecks, [omittedCheck]: false };

      const checksUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/admin/partners/${partner.id}/checks`)
        .set("Cookie", admin.cookies)
        .send(checksWithOneMissing);
      expect(checksUpdate.status).toBe(200);

      const publish = await request(app.getHttpServer()).post(`/api/v1/admin/partners/${partner.id}/publish`).set("Cookie", admin.cookies);
      expect(publish.status).toBe(409);

      const reloaded = await prisma.businessPartner.findUniqueOrThrow({ where: { id: partner.id } });
      expect(reloaded.publicationStatus).toBe("UNPUBLISHED");
    }
  });

  it("Example (AC): a partner with all 7 validations recorded true can be published and then appears via the public endpoint", async () => {
    const partner = await createPartner();

    const checksUpdate = await request(app.getHttpServer())
      .patch(`/api/v1/admin/partners/${partner.id}/checks`)
      .set("Cookie", admin.cookies)
      .send({
        legalValidationConfirmed: true,
        commercialValidationConfirmed: true,
        benefitConfirmed: true,
        agreementValidityConfirmed: true,
        logoAuthorizationConfirmed: true,
        contactConfirmed: true,
        coverageConfirmed: true,
      });
    expect(checksUpdate.status).toBe(200);

    const publish = await request(app.getHttpServer()).post(`/api/v1/admin/partners/${partner.id}/publish`).set("Cookie", admin.cookies);
    expect(publish.status).toBe(200);
    expect(publish.body.publicationStatus).toBe("PUBLISHED");

    const publicList = await request(app.getHttpServer()).get("/api/v1/partners");
    expect(publicList.status).toBe(200);
    const found = publicList.body.find((p: { id: string }) => p.id === partner.id);
    expect(found).toBeDefined();
    expect(found.tradeName).toBe(partner.tradeName);
    // public payload must never leak internal/legal/PII fields
    expect(found.legalName).toBeUndefined();
    expect(found.nit).toBeUndefined();
    expect(found.internalNotes).toBeUndefined();
    expect(found.corporateEmail).toBeUndefined();
    expect(found.address).toBeUndefined();
    expect(found.phone).toBeUndefined();
  });

  it("list() and findById() return created partners for admins", async () => {
    const partner = await createPartner();

    const list = await request(app.getHttpServer()).get("/api/v1/admin/partners").set("Cookie", admin.cookies);
    expect(list.status).toBe(200);
    expect(list.body.some((p: { id: string }) => p.id === partner.id)).toBe(true);

    const found = await request(app.getHttpServer()).get(`/api/v1/admin/partners/${partner.id}`).set("Cookie", admin.cookies);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(partner.id);
  });
});
