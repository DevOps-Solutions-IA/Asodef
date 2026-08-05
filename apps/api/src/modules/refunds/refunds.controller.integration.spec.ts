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
import { generatePublicReference } from "../payment-orders/public-reference";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Refund endpoints (integration, real HTTP, BOLD_MODE=mock)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdCustomerIds: string[] = [];

  let requester: { user: User; cookies: string[] };
  let approver: { user: User; cookies: string[] };
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

    requester = await createActor("FINANCE");
    approver = await createActor("FINANCE");
    readOnlyActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      // AuditLog rows written against refundId (not paymentOrderId) -
      // e.g. "refund.requested"/"refund.approved" - aren't caught by
      // the filter above, so they must be cleared before refunds
      // themselves are deleted or the refund_id FK is violated.
      await prisma.auditLog.deleteMany({ where: { refund: { paymentOrder: { customerId: { in: createdCustomerIds } } } } });
      await prisma.refund.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentEvent.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentTransaction.deleteMany({ where: { paymentAttempt: { paymentOrder: { customerId: { in: createdCustomerIds } } } } });
      await prisma.paymentAttempt.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentReceipt.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.consentRecord.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
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
        email: `refund-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Refund Test User",
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

  /** Real APPROVED order + real PaymentAttempt with a real
   * providerReferenceId, via the actual mock-Bold create flow - not a
   * hand-set fixture - matching the AC's own "mock-approved order"
   * wording exactly. */
  async function createApprovedOrder(amountCents = 200_000) {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `refund-test-${randomUUID()}`,
        fullName: "Cliente Reembolso de Prueba",
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
        concept: "Cuota reembolso de prueba",
        amountCents,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const order = await prisma.paymentOrder.create({
      data: {
        publicReference: generatePublicReference(),
        obligationId: obligation.id,
        customerId: customer.id,
        amountCents: obligation.amountCents,
        currency: obligation.currency,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const createResponse = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
    expect(createResponse.body.orderStatus).toBe("APPROVED");

    return { customer, obligation, order };
  }

  it("Negative case (AC): a user with only payments.read (no payments.refund) requesting a refund gets 403", async () => {
    const { order } = await createApprovedOrder();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", readOnlyActor.cookies)
      .send({ amountCents: 50_000, reason: "Prueba" });
    expect(response.status).toBe(403);
  });

  it("Negative case (AC): requesting a refund larger than the original amount returns 400", async () => {
    const { order } = await createApprovedOrder(100_000);
    const response = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 150_000, reason: "Monto excesivo de prueba" });
    expect(response.status).toBe(400);
  });

  it("rejects a refund request for an order that is not APPROVED", async () => {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `refund-pending-${randomUUID()}`,
        fullName: "Cliente Orden Pendiente",
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
        concept: "Cuota pendiente de prueba",
        amountCents: 100_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });
    const order = await prisma.paymentOrder.create({
      data: {
        publicReference: generatePublicReference(),
        obligationId: obligation.id,
        customerId: customer.id,
        amountCents: obligation.amountCents,
        currency: obligation.currency,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 50_000, reason: "Orden no aprobada" });
    expect(response.status).toBe(409);
  });

  it("returns 404 requesting a refund for an unknown order reference", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/payments/this-reference-does-not-exist/refund")
      .set("Cookie", requester.cookies)
      .send({ amountCents: 50_000, reason: "Prueba" });
    expect(response.status).toBe(404);
  });

  it("Negative case (AC): a requester without payments.refund.approve cannot approve their own refund request (403)", async () => {
    const { order } = await createApprovedOrder(100_000);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 100_000, reason: "Prueba de permisos" });
    expect(created.status).toBe(201);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${created.body.id}/approve`)
      .set("Cookie", readOnlyActor.cookies);
    expect(response.status).toBe(403);
  });

  it("uploads evidence for a pending refund", async () => {
    const { order } = await createApprovedOrder(100_000);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 40_000, reason: "Reembolso parcial con evidencia" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${created.body.id}/evidence`)
      .set("Cookie", requester.cookies)
      .attach("file", Buffer.from("evidencia de reembolso"), "evidencia.pdf");
    expect(response.status).toBe(200);
    expect(response.body.hasEvidence).toBe(true);
    expect(response.body).not.toHaveProperty("evidencePath");
  });

  it("Example (AC): requesting and then approving a FULL refund for a mock-approved order transitions it to REFUNDED", async () => {
    const { order } = await createApprovedOrder(200_000);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 200_000, reason: "Reembolso total - cliente insatisfecho" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("PENDING_APPROVAL");

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${created.body.id}/approve`)
      .set("Cookie", approver.cookies);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.providerReference).toBeTruthy();

    const reloadedOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloadedOrder.status).toBe("REFUNDED");

    const auditEntries = await prisma.auditLog.findMany({ where: { refundId: created.body.id } });
    const actions = auditEntries.map((entry) => entry.action).sort();
    expect(actions).toEqual(["refund.approved", "refund.requested"]);
  });

  it("a PARTIAL refund approval transitions the order to PARTIALLY_REFUNDED", async () => {
    const { order } = await createApprovedOrder(200_000);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 75_000, reason: "Reembolso parcial de prueba" });

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/admin/refunds/${created.body.id}/approve`)
      .set("Cookie", approver.cookies);
    expect(approved.status).toBe(200);

    const reloadedOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloadedOrder.status).toBe("PARTIALLY_REFUNDED");
  });

  it("rejects approving a refund that is not PENDING_APPROVAL (already approved)", async () => {
    const { order } = await createApprovedOrder(100_000);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 100_000, reason: "Prueba de doble aprobación" });

    const first = await request(app.getHttpServer()).post(`/api/v1/admin/refunds/${created.body.id}/approve`).set("Cookie", approver.cookies);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer()).post(`/api/v1/admin/refunds/${created.body.id}/approve`).set("Cookie", approver.cookies);
    expect(second.status).toBe(409);
  });

  it("US-063: a CUSTOMER actor (holds payments.read for its own self-service lookup, no row-level scoping) gets 403 on admin list()/get(), not every other customer's refunds", async () => {
    const { order } = await createApprovedOrder(100_000);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 30_000, reason: "Prueba de aislamiento por rol" });
    expect(created.status).toBe(201);

    const list = await request(app.getHttpServer()).get("/api/v1/admin/refunds").set("Cookie", readOnlyActor.cookies);
    expect(list.status).toBe(403);

    const found = await request(app.getHttpServer()).get(`/api/v1/admin/refunds/${created.body.id}`).set("Cookie", readOnlyActor.cookies);
    expect(found.status).toBe(403);
  });

  it("US-063: list() filters by paymentOrderId for /admin/pagos's own order-detail view", async () => {
    const { order: orderA } = await createApprovedOrder(100_000);
    const { order: orderB } = await createApprovedOrder(100_000);
    const refundA = await request(app.getHttpServer())
      .post(`/api/v1/payments/${orderA.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 20_000, reason: "Reembolso orden A" });
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${orderB.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 20_000, reason: "Reembolso orden B" });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/refunds?paymentOrderId=${orderA.id}`)
      .set("Cookie", requester.cookies);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(refundA.body.id);
  });

  it("list()/get() return created refunds for authorized readers", async () => {
    const { order } = await createApprovedOrder(100_000);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/payments/${order.publicReference}/refund`)
      .set("Cookie", requester.cookies)
      .send({ amountCents: 30_000, reason: "Prueba de listado" });

    const list = await request(app.getHttpServer()).get("/api/v1/admin/refunds").set("Cookie", requester.cookies);
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: string }) => r.id === created.body.id)).toBe(true);

    const found = await request(app.getHttpServer()).get(`/api/v1/admin/refunds/${created.body.id}`).set("Cookie", requester.cookies);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(created.body.id);
  });
});
