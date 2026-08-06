import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { PrismaClient, User } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { upsertActivePlanDemo } from "../../database/seed-payments";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

function validPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    category: "reclamo",
    applicantName: "Titular de Prueba",
    applicantContact: `pqr-${randomUUID()}@example.com`,
    description: "No estoy de acuerdo con el cobro aplicado.",
    ...overrides,
  };
}

describe("PQR case endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdObligationIds: string[] = [];
  let preservedConsentIds: string[] = [];

  let admin: { user: User; cookies: string[] };
  let noPermActor: { user: User; cookies: string[] };
  let dataProcessingHandle: PublishedForTestHandle | null = null;

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

    // US-072: PQR case creation now also records a data_processing
    // ConsentRecord, which requires a resolvable PUBLISHED
    // tratamiento-de-datos version - see publishDraftForTest's own doc
    // comment (test-only, reverted in afterAll).
    dataProcessingHandle = await publishDraftForTest(prisma as unknown as PrismaClient, "tratamiento-de-datos");
    preservedConsentIds = (await prisma.consentRecord.findMany({ where: { source: "web_pqr_form" }, select: { id: true } })).map((record) => record.id);
  });

  beforeEach(async () => {
    const redisClient = app.get(RedisService).getClient();
    const keysToClear = await redisClient.keys("ratelimit:pqr-cases:*");
    if (keysToClear.length > 0) {
      await redisClient.del(...keysToClear);
    }
  });

  afterAll(async () => {
    if (dataProcessingHandle) {
      await prisma.consentRecord.deleteMany({ where: { source: "web_pqr_form", id: { notIn: preservedConsentIds } } });
      await dataProcessingHandle.restore();
    }
    // pqr_cases holds a Restrict FK into payment_orders
    // (relatedPaymentOrderId), so cases must be deleted before orders;
    // orders hold a Restrict FK into obligations, and obligations into
    // customers - this order mirrors that dependency chain exactly.
    if (createdCaseIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { pqrCaseId: { in: createdCaseIds } } });
      await prisma.pqrCase.deleteMany({ where: { id: { in: createdCaseIds } } });
    }
    if (createdOrderIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrderId: { in: createdOrderIds } } });
      await prisma.paymentOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdObligationIds.length > 0) {
      await prisma.obligation.deleteMany({ where: { id: { in: createdObligationIds } } });
    }
    if (createdCustomerIds.length > 0) {
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
        email: `pqr-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "PQR Test User",
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

  async function createCaseViaApi(payloadOverrides: Partial<Record<string, unknown>> = {}) {
    const response = await request(app.getHttpServer()).post("/api/v1/pqr-cases").send(validPayload(payloadOverrides));
    expect(response.status).toBe(201);

    const row = await prisma.pqrCase.findUniqueOrThrow({ where: { caseNumber: response.body.caseNumber } });
    createdCaseIds.push(row.id);
    return { response, row };
  }

  it("Example (AC): submitting a PQR returns a caseNumber and creates a RECEIVED case", async () => {
    const { response } = await createCaseViaApi({ category: "reclamo" });

    expect(response.body.caseNumber).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(response.body.status).toBe("RECEIVED");
    expect(response.body.category).toBe("reclamo");
    expect(response.body).not.toHaveProperty("id");
    expect(response.body).not.toHaveProperty("applicantName");
    expect(response.body).not.toHaveProperty("applicantContact");
  });

  it("US-072: submitting a PQR records a data_processing ConsentRecord tied to the published policy version", async () => {
    const { response } = await createCaseViaApi({ category: "reclamo" });
    const created = await prisma.pqrCase.findUniqueOrThrow({ where: { caseNumber: response.body.caseNumber } });
    createdCaseIds.push(created.id);

    const record = await prisma.consentRecord.findFirst({
      where: { source: "web_pqr_form", legalDocumentVersionId: dataProcessingHandle!.versionId },
      include: { consentPurpose: true },
      orderBy: { createdAt: "desc" },
    });
    expect(record).not.toBeNull();
    expect(record?.consentPurpose.key).toBe("data_processing");
    expect(record?.status).toBe("GRANTED");
    expect(record?.customerId).toBeNull();
  });

  it("Example (AC): a linked payment reference is resolved and visible in the admin queue", async () => {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `pqr-test-${randomUUID()}`,
        fullName: "Cliente de Prueba PQR",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);
    const plan = await upsertActivePlanDemo(prisma);
    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Cuota de prueba PQR",
        amountCents: 100_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });
    createdObligationIds.push(obligation.id);
    const order = await prisma.paymentOrder.create({
      data: {
        publicReference: `pqr-test-order-${randomUUID()}`,
        obligationId: obligation.id,
        customerId: customer.id,
        amountCents: 100_000,
        currency: "COP",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    createdOrderIds.push(order.id);

    const { row } = await createCaseViaApi({ category: "reclamo", paymentReference: order.publicReference });

    expect(row.relatedPaymentOrderId).toBe(order.id);
    expect(row.relatedCustomerId).toBe(customer.id);

    const adminView = await request(app.getHttpServer()).get(`/api/v1/admin/pqr-cases/${row.id}`).set("Cookie", admin.cookies);
    expect(adminView.status).toBe(200);
    expect(adminView.body.relatedPaymentOrderId).toBe(order.id);
  });

  it("silently ignores an unresolvable payment reference (still creates the case)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/pqr-cases")
      .send(validPayload({ paymentReference: "not-a-real-reference" }));
    expect(response.status).toBe(201);

    const row = await prisma.pqrCase.findUniqueOrThrow({ where: { caseNumber: response.body.caseNumber } });
    createdCaseIds.push(row.id);
    expect(row.relatedPaymentOrderId).toBeNull();
  });

  it("rate-limits repeated submissions with a real 429", async () => {
    const max = app.get<ConfigService<{ PQR_CASES_RATE_LIMIT_IP_MAX: number }, true>>(ConfigService).get("PQR_CASES_RATE_LIMIT_IP_MAX", {
      infer: true,
    });

    for (let i = 0; i < max; i++) {
      const response = await request(app.getHttpServer()).post("/api/v1/pqr-cases").send(validPayload());
      expect(response.status).toBe(201);
      createdCaseIds.push((await prisma.pqrCase.findUniqueOrThrow({ where: { caseNumber: response.body.caseNumber } })).id);
    }

    const limited = await request(app.getHttpServer()).post("/api/v1/pqr-cases").send(validPayload());
    expect(limited.status).toBe(429);
  });

  it("looking up by caseNumber (public, no auth) shows current status", async () => {
    const { response: created } = await createCaseViaApi();

    const response = await request(app.getHttpServer()).get(`/api/v1/pqr-cases/${created.body.caseNumber}`);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("RECEIVED");
  });

  it("returns a generic 404 for a non-existent case number", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/pqr-cases/this-case-does-not-exist");
    expect(response.status).toBe(404);
  });

  it("creates an audit trail entry for the creation event", async () => {
    const { row } = await createCaseViaApi();

    const entries = await prisma.auditLog.findMany({ where: { pqrCaseId: row.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("pqr_case.created");
  });

  it("returns 403 for the admin list endpoint without pqr.manage", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/admin/pqr-cases").set("Cookie", noPermActor.cookies);
    expect(response.status).toBe(403);
  });

  it("Example (AC): draft -> assigned -> review -> resolved -> closed produces a full audit trail", async () => {
    const { row } = await createCaseViaApi();

    const assign = await request(app.getHttpServer())
      .patch(`/api/v1/admin/pqr-cases/${row.id}/assign`)
      .set("Cookie", admin.cookies)
      .send({ assignedTeam: "Servicio al cliente" });
    expect(assign.status).toBe(200);
    expect(assign.body.assignedTeam).toBe("Servicio al cliente");

    // assign() only sets assignedTeam - it never changes status on its
    // own (a case can be reassigned to a different team without moving
    // status), so ASSIGNED is its own explicit transition.
    const toAssigned = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "ASSIGNED", notes: "Caso asignado." });
    expect(toAssigned.status).toBe(200);

    const toReview = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "IN_REVIEW", notes: "Iniciando revisión del caso." });
    expect(toReview.status).toBe(200);

    const resolve = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "RESOLVED", notes: "Caso resuelto.", resolution: "Se realizó el ajuste solicitado.", satisfactionScore: 5 });
    expect(resolve.status).toBe(200);
    expect(resolve.body.resolution).toBe("Se realizó el ajuste solicitado.");
    expect(resolve.body.satisfactionScore).toBe(5);

    const close = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "CLOSED", notes: "Cerrando caso resuelto." });
    expect(close.status).toBe(200);
    expect(close.body.status).toBe("CLOSED");

    const auditEntries = await prisma.auditLog.findMany({ where: { pqrCaseId: row.id }, orderBy: { createdAt: "asc" } });
    expect(auditEntries.map((e) => e.newStatus)).toEqual(["RECEIVED", "RECEIVED", "ASSIGNED", "IN_REVIEW", "RESOLVED", "CLOSED"]);

    const publicLookup = await request(app.getHttpServer()).get(`/api/v1/pqr-cases/${row.caseNumber}`);
    expect(publicLookup.body.status).toBe("CLOSED");
    expect(publicLookup.body.resolution).toBe("Se realizó el ajuste solicitado.");
  });

  it("Negative case (AC): closing a case in INFORMATION_REQUIRED without a resolution note is rejected", async () => {
    const { row } = await createCaseViaApi();

    await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "ASSIGNED", notes: "Asignando caso." });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "IN_REVIEW", notes: "En revisión." });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "INFORMATION_REQUIRED", notes: "Se requiere información adicional." });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "CLOSED", notes: "Intentando cerrar sin resolución." });

    expect(response.status).toBe(400);

    const persisted = await prisma.pqrCase.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted.status).toBe("INFORMATION_REQUIRED");
  });

  it("rejects an invalid transition (e.g. RECEIVED straight to RESOLVED) with 400", async () => {
    const { row } = await createCaseViaApi();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "RESOLVED", notes: "Intento inválido." });

    expect(response.status).toBe(400);
  });

  it("rejects a transition without notes with 400", async () => {
    const { row } = await createCaseViaApi();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/pqr-cases/${row.id}/transition`)
      .set("Cookie", admin.cookies)
      .send({ status: "ASSIGNED" });

    expect(response.status).toBe(400);
  });

  it("list() filters by status", async () => {
    const { row } = await createCaseViaApi();

    const response = await request(app.getHttpServer()).get("/api/v1/admin/pqr-cases?status=RECEIVED").set("Cookie", admin.cookies);

    expect(response.status).toBe(200);
    expect(response.body.items.some((item: { id: string }) => item.id === row.id)).toBe(true);
    expect(response.body.items.every((item: { status: string }) => item.status === "RECEIVED")).toBe(true);
  });
});
