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
  let readOnlyActor: { user: User; cookies: string[] };

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
    // COMPANY_PARTNER holds companies.read but not companies.manage -
    // exactly the "can list, cannot create" case US-074 AC requires.
    readOnlyActor = await createActor("COMPANY_PARTNER");
  });

  afterAll(async () => {
    if (createdCompanyIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
      await prisma.commercialContact.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
      await prisma.companySite.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
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

  function randomDigits(length: number): string {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
  }

  async function createCompany() {
    const company = await prisma.company.create({
      data: {
        name: "Empresa Afiliada de Prueba",
        nit: `900${randomDigits(6)}-${Math.floor(Math.random() * 10)}`,
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
    expect(response.body.items.some((c: { id: string }) => c.id === company.id)).toBe(true);
  });

  it("uses validated bounded server-side search for company lists", async () => {
    const company = await createCompany();
    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/admin/companies?search=${encodeURIComponent(company.nit)}&pageSize=1&sortBy=name&sortOrder=asc`)
      .set("Cookie", commercial.cookies);
    expect(filtered.status).toBe(200);
    expect(filtered.body).toMatchObject({ total: 1, pageSize: 1 });
    expect(filtered.body.items[0].id).toBe(company.id);

    const unbounded = await request(app.getHttpServer()).get("/api/v1/admin/companies?pageSize=1000").set("Cookie", commercial.cookies);
    expect(unbounded.status).toBe(400);
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

  it("creates and lists governed company contacts and sites using the existing company aggregate", async () => {
    const company = await createCompany();
    const contact = await request(app.getHttpServer()).post(`/api/v1/admin/companies/${company.id}/contacts`).set("Cookie", commercial.cookies).send({
      fullName: "María Comercial", role: "Gerente", email: "maria@example.com", isPrimary: true,
    });
    expect(contact.status).toBe(201);
    expect(contact.body).toMatchObject({ fullName: "María Comercial", isPrimary: true });

    const site = await request(app.getHttpServer()).post(`/api/v1/admin/companies/${company.id}/sites`).set("Cookie", commercial.cookies).send({
      name: "Sede principal", address: "Carrera 1 # 2-3", city: "Cali", isPrimary: true,
    });
    expect(site.status).toBe(201);
    expect(site.body).toMatchObject({ companyId: company.id, city: "Cali", isPrimary: true });

    const [contacts, sites] = await Promise.all([
      request(app.getHttpServer()).get(`/api/v1/admin/companies/${company.id}/contacts`).set("Cookie", readOnlyActor.cookies),
      request(app.getHttpServer()).get(`/api/v1/admin/companies/${company.id}/sites`).set("Cookie", readOnlyActor.cookies),
    ]);
    expect(contacts.status).toBe(200);
    expect(contacts.body).toHaveLength(1);
    expect(sites.status).toBe(200);
    expect(sites.body).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { companyId: company.id, action: { in: ["company.contact_created", "company.site_created"] } } })).toBe(2);
  });

  it("rejects incomplete contacts and company contact/site writes without companies.manage", async () => {
    const company = await createCompany();
    const incomplete = await request(app.getHttpServer()).post(`/api/v1/admin/companies/${company.id}/contacts`).set("Cookie", commercial.cookies).send({ fullName: "Sin canal" });
    expect(incomplete.status).toBe(400);
    const forbidden = await request(app.getHttpServer()).post(`/api/v1/admin/companies/${company.id}/sites`).set("Cookie", readOnlyActor.cookies).send({ name: "Sede", address: "Calle 1", city: "Cali" });
    expect(forbidden.status).toBe(403);
  });

  it("returns 404 for a nonexistent company id", async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/admin/companies/${randomUUID()}`).set("Cookie", commercial.cookies);
    expect(response.status).toBe(404);
  });

  it("Example (AC): creates a company for an actor holding companies.manage, normalizes the NIT, and records an AuditLog", async () => {
    const nit = `901.${randomUUID().slice(0, 6)}-7`;
    const response = await request(app.getHttpServer()).post("/api/v1/admin/companies").set("Cookie", commercial.cookies).send({
      name: "Nueva Empresa Afiliada S.A.S.",
      nit,
      contactName: "Contacto Nuevo",
      contactEmail: `new-company-${randomUUID()}@example.com`,
      sector: "Manufactura",
    });

    expect(response.status).toBe(201);
    expect(response.body.nit).toBe(nit.replace(/[^0-9-]/g, ""));
    expect(response.body.status).toBe("ACTIVE");
    createdCompanyIds.push(response.body.id);

    const auditRow = await prisma.auditLog.findFirst({ where: { companyId: response.body.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.action).toBe("company.created");
    expect(auditRow?.actorUserId).toBe(commercial.user.id);
  });

  it("Negative case (AC): duplicate NIT (even in a different format) returns 409, not a raw DB error", async () => {
    const company = await createCompany();

    const dottedNit = company.nit.length >= 3 ? `${company.nit.slice(0, 3)}.${company.nit.slice(3)}` : company.nit;
    const response = await request(app.getHttpServer()).post("/api/v1/admin/companies").set("Cookie", commercial.cookies).send({
      name: "Empresa Duplicada",
      nit: dottedNit,
      contactName: "Contacto Duplicado",
      contactEmail: `dup-${randomUUID()}@example.com`,
      sector: "Servicios",
    });

    expect(response.status).toBe(409);
  });

  it("Negative case (AC): an actor with companies.read but not companies.manage gets 403 on create", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/admin/companies").set("Cookie", readOnlyActor.cookies).send({
      name: "Empresa No Autorizada",
      nit: `902${randomUUID().slice(0, 6)}-1`,
      contactName: "Contacto",
      contactEmail: `unauthorized-${randomUUID()}@example.com`,
      sector: "Servicios",
    });

    expect(response.status).toBe(403);
  });
});
