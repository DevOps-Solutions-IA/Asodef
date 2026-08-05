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

describe("Reconciliation endpoints (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdCustomerIds: string[] = [];

  let finance: { user: User; cookies: string[] };
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

    finance = await createActor("FINANCE");
    readOnlyActor = await createActor("CUSTOMER");
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.reconciliationDifference.deleteMany({
        where: { paymentOrder: { customerId: { in: createdCustomerIds } } },
      });
      await prisma.reconciliation.deleteMany({ where: { responsibleUserId: finance.user.id } });
      await prisma.refund.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentEvent.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
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
        email: `reconciliation-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Reconciliation Test User",
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

  /**
   * A reconciliation run scans PaymentOrder/PaymentEvent system-wide
   * for its queried date range - by design (the AC's own point is a
   * cross-domain sweep, not a per-customer query). That means a real
   * "now" window would sweep in every other test file's fixtures
   * created earlier in this same test session (payment-orders,
   * receipts, bold-payments, webhooks, refunds, contracts all create
   * real orders/events). Each test here instead gets its own unique,
   * far-past synthetic anchor timestamp - fixtures are created
   * explicitly at that anchor (createdAt/receivedAt are freely
   * overridable @default(now()) fields), and the queried range is a
   * tight window around only that anchor, guaranteeing isolation from
   * every other test (in this file or any other) without relying on
   * timing/ordering.
   */
  function uniqueAnchor(): Date {
    return new Date(Date.now() - 1_000 * 60 * 60 * 24 * 365 * (1 + Math.random() * 20));
  }

  function dateRangeAround(anchor: Date) {
    return {
      rangeStart: new Date(anchor.getTime() - 5 * 60 * 1000).toISOString(),
      rangeEnd: new Date(anchor.getTime() + 5 * 60 * 1000).toISOString(),
    };
  }

  async function createOrder(anchor: Date, status: "PENDING" | "APPROVED" = "PENDING", amountCents = 200_000) {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `reconciliation-test-${randomUUID()}`,
        fullName: "Cliente Conciliación de Prueba",
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
        concept: "Cuota conciliación de prueba",
        amountCents,
        currency: "COP",
        dueDate: new Date(anchor.getTime() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const order = await prisma.paymentOrder.create({
      data: {
        publicReference: generatePublicReference(),
        obligationId: obligation.id,
        customerId: customer.id,
        amountCents,
        currency: "COP",
        status,
        createdAt: anchor,
        expiresAt: new Date(anchor.getTime() + 30 * 60 * 1000),
      },
    });

    return { customer, obligation, order };
  }

  it("returns 403 running reconciliation without payments.reconcile", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", readOnlyActor.cookies)
      .send(dateRangeAround(uniqueAnchor()));
    expect(response.status).toBe(403);
  });

  it("Example (AC): a manually-created PaymentEvent reporting provider APPROVED with no corresponding internal transition surfaces exactly one difference", async () => {
    const anchor = uniqueAnchor();
    const { order } = await createOrder(anchor, "PENDING");

    // "manually creating a PaymentEvent" (AC, verbatim) - direct insert,
    // bypassing BoldWebhookService.processDelivery() entirely, so the
    // order's own status is deliberately never transitioned.
    await prisma.paymentEvent.create({
      data: {
        paymentOrderId: order.id,
        source: "bold",
        eventType: "webhook",
        idempotencyKey: `manual-${randomUUID()}`,
        payload: { reference_id: order.publicReference, status: "APPROVED" },
        processedAt: new Date(),
        receivedAt: anchor,
      },
    });

    const run = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", finance.cookies)
      .send(dateRangeAround(anchor));
    expect(run.status).toBe(201);
    expect(run.body.differencesFound).toBe(1);

    const differences = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${run.body.id}/differences`)
      .set("Cookie", finance.cookies);
    expect(differences.status).toBe(200);
    expect(differences.body).toHaveLength(1);
    expect(differences.body[0].kind).toBe("PROVIDER_APPROVED_INTERNALLY_PENDING");
    expect(differences.body[0].paymentOrderId).toBe(order.id);
    expect(differences.body[0].resolutionStatus).toBe("OPEN");
  });

  it("Negative case (AC): running reconciliation twice over the same period does not duplicate an already-resolved difference", async () => {
    const anchor = uniqueAnchor();
    const { order } = await createOrder(anchor, "PENDING");
    await prisma.paymentEvent.create({
      data: {
        paymentOrderId: order.id,
        source: "bold",
        eventType: "webhook",
        idempotencyKey: `manual-${randomUUID()}`,
        payload: { reference_id: order.publicReference, status: "APPROVED" },
        processedAt: new Date(),
        receivedAt: anchor,
      },
    });

    const range = dateRangeAround(anchor);
    const firstRun = await request(app.getHttpServer()).post("/api/v1/admin/reconciliation/runs").set("Cookie", finance.cookies).send(range);
    expect(firstRun.body.differencesFound).toBe(1);

    const firstDifferences = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${firstRun.body.id}/differences`)
      .set("Cookie", finance.cookies);
    const differenceId = firstDifferences.body[0].id;

    const resolve = await request(app.getHttpServer())
      .post(`/api/v1/admin/reconciliation/differences/${differenceId}/resolve`)
      .set("Cookie", finance.cookies)
      .send({ resolutionNotes: "Confirmado manualmente con el proveedor - se aplicó la transición interna correcta." });
    expect(resolve.status).toBe(200);
    expect(resolve.body.resolutionStatus).toBe("RESOLVED");
    // US-063 AC2: "resolution workflow (notes, resolved-by, resolved-at)".
    expect(resolve.body.resolvedByUserId).toBe(finance.user.id);
    expect(resolve.body.resolvedAt).not.toBeNull();

    const firstRunReloaded = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${firstRun.body.id}`)
      .set("Cookie", finance.cookies);
    expect(firstRunReloaded.body.resolutionStatus).toBe("RESOLVED");

    // Second run over the same period - the underlying issue is
    // already tracked (and resolved), so no new difference is created.
    const secondRun = await request(app.getHttpServer()).post("/api/v1/admin/reconciliation/runs").set("Cookie", finance.cookies).send(range);
    expect(secondRun.status).toBe(201);
    expect(secondRun.body.differencesFound).toBe(0);

    const totalDifferencesForOrder = await prisma.reconciliationDifference.count({ where: { paymentOrderId: order.id } });
    expect(totalDifferencesForOrder).toBe(1);
  });

  it("rejects resolving an already-resolved difference", async () => {
    const anchor = uniqueAnchor();
    const { order } = await createOrder(anchor, "PENDING");
    await prisma.paymentEvent.create({
      data: {
        paymentOrderId: order.id,
        source: "bold",
        eventType: "webhook",
        idempotencyKey: `manual-${randomUUID()}`,
        payload: { reference_id: order.publicReference, status: "APPROVED" },
        processedAt: new Date(),
        receivedAt: anchor,
      },
    });

    const run = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", finance.cookies)
      .send(dateRangeAround(anchor));
    const differences = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${run.body.id}/differences`)
      .set("Cookie", finance.cookies);
    const differenceId = differences.body[0].id;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/reconciliation/differences/${differenceId}/resolve`)
      .set("Cookie", finance.cookies)
      .send({ resolutionNotes: "Primera resolución." });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/reconciliation/differences/${differenceId}/resolve`)
      .set("Cookie", finance.cookies)
      .send({ resolutionNotes: "Segundo intento." });
    expect(second.status).toBe(409);
  });

  it("detects amount-mismatch between an order and its originating obligation", async () => {
    const anchor = uniqueAnchor();
    const { order, obligation } = await createOrder(anchor, "PENDING", 300_000);
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { amountCents: 999_000 } });

    const run = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", finance.cookies)
      .send(dateRangeAround(anchor));
    expect(run.status).toBe(201);

    const differences = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${run.body.id}/differences`)
      .set("Cookie", finance.cookies);
    const amountMismatch = differences.body.find((d: { kind: string }) => d.kind === "AMOUNT_MISMATCH");
    expect(amountMismatch).toBeDefined();
    expect(amountMismatch.paymentOrderId).toBe(order.id);
    expect(amountMismatch.details).toMatchObject({ orderAmountCents: 999_000, obligationAmountCents: obligation.amountCents });
  });

  it("detects refund-inconsistency when an APPROVED refund's order doesn't reflect REFUNDED", async () => {
    const anchor = uniqueAnchor();
    const { order } = await createOrder(anchor, "APPROVED", 150_000);
    await prisma.refund.create({
      data: {
        paymentOrderId: order.id,
        amountCents: 150_000,
        reason: "Prueba de inconsistencia de reembolso",
        status: "APPROVED",
        createdAt: anchor,
      },
    });
    // Order deliberately left at APPROVED (not REFUNDED) - simulating a
    // genuine data-integrity gap the reconciliation run should catch.

    const run = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", finance.cookies)
      .send(dateRangeAround(anchor));
    const differences = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${run.body.id}/differences`)
      .set("Cookie", finance.cookies);

    const refundInconsistency = differences.body.find((d: { kind: string }) => d.kind === "REFUND_INCONSISTENCY");
    expect(refundInconsistency).toBeDefined();
    expect(refundInconsistency.paymentOrderId).toBe(order.id);
  });

  it("detects unprocessed-notification for an event with no processedAt and no other explaining kind", async () => {
    const anchor = uniqueAnchor();
    const { order } = await createOrder(anchor, "PENDING");
    await prisma.paymentEvent.create({
      data: {
        paymentOrderId: order.id,
        source: "bold",
        eventType: "webhook",
        idempotencyKey: `manual-${randomUUID()}`,
        payload: { reference_id: order.publicReference, status: "RUNNING" },
        processedAt: null,
        receivedAt: anchor,
      },
    });

    const run = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", finance.cookies)
      .send(dateRangeAround(anchor));
    const differences = await request(app.getHttpServer())
      .get(`/api/v1/admin/reconciliation/runs/${run.body.id}/differences`)
      .set("Cookie", finance.cookies);

    expect(differences.body.some((d: { kind: string }) => d.kind === "UNPROCESSED_NOTIFICATION")).toBe(true);
  });

  it("list()/get() return created reconciliation runs for authorized users", async () => {
    const run = await request(app.getHttpServer())
      .post("/api/v1/admin/reconciliation/runs")
      .set("Cookie", finance.cookies)
      .send(dateRangeAround(uniqueAnchor()));

    const list = await request(app.getHttpServer()).get("/api/v1/admin/reconciliation/runs").set("Cookie", finance.cookies);
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: string }) => r.id === run.body.id)).toBe(true);

    const found = await request(app.getHttpServer()).get(`/api/v1/admin/reconciliation/runs/${run.body.id}`).set("Cookie", finance.cookies);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(run.body.id);
  });
});
