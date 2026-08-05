import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { PaymentOrderStatus } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { generatePublicReference } from "../payment-orders/public-reference";
import { upsertActivePlanDemo } from "../../database/seed-payments";

async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("Bold webhook endpoint (integration, real HTTP, BOLD_MODE=mock)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentReceipt.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentEvent.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentTransaction.deleteMany({ where: { paymentAttempt: { paymentOrder: { customerId: { in: createdCustomerIds } } } } });
      await prisma.paymentAttempt.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await app.close();
  });

  async function createOrder(status: PaymentOrderStatus = "PROCESSING", withAttempt = true) {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `webhook-test-${randomUUID()}`,
        fullName: "Cliente Webhook de Prueba",
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
        concept: "Cuota webhook de prueba",
        amountCents: 111_000,
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
        status,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    if (withAttempt) {
      await prisma.paymentAttempt.create({ data: { paymentOrderId: order.id, status: "PENDING" } });
    }

    return { customer, obligation, order };
  }

  it("Example (AC): a valid APPROVED event transitions the order and creates exactly one PaymentEvent and one AuditLog entry even when POSTed twice", async () => {
    const { order } = await createOrder("PROCESSING");
    const body = { reference_id: order.publicReference, status: "APPROVED" };

    const first = await request(app.getHttpServer()).post("/api/v1/webhooks/bold").send(body);
    expect(first.status).toBe(202);

    await waitFor(
      () => prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } }),
      (o) => o.status === "APPROVED",
    );

    const second = await request(app.getHttpServer()).post("/api/v1/webhooks/bold").send(body);
    expect(second.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const events = await prisma.paymentEvent.findMany({ where: { paymentOrderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("webhook");

    const auditEntries = await prisma.auditLog.findMany({ where: { paymentOrderId: order.id } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      action: "order.status_transition",
      previousStatus: "PROCESSING",
      newStatus: "APPROVED",
      applied: true,
      source: "WEBHOOK",
    });

    const finalOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("APPROVED");
  });

  it("Negative case (AC): a malformed payload (missing reference_id) returns 400 and creates no PaymentEvent", async () => {
    const before = await prisma.paymentEvent.count();
    const response = await request(app.getHttpServer()).post("/api/v1/webhooks/bold").send({ status: "APPROVED" });
    expect(response.status).toBe(400);
    const after = await prisma.paymentEvent.count();
    expect(after).toBe(before);
  });

  it("returns 400 for a payload missing status", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/webhooks/bold").send({ reference_id: "abc" });
    expect(response.status).toBe(400);
  });

  it("acknowledges (202) an event for an unknown order reference without storing anything", async () => {
    const before = await prisma.paymentEvent.count();
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/bold")
      .send({ reference_id: "does-not-exist-anywhere", status: "APPROVED" });
    expect(response.status).toBe(202);
    const after = await prisma.paymentEvent.count();
    expect(after).toBe(before);
  });

  it("preserves an unknown Bold status as a safe non-success state instead of approving", async () => {
    const { order } = await createOrder("PROCESSING");
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/bold")
      .send({ reference_id: order.publicReference, status: "SOME_FUTURE_STATUS" });
    expect(response.status).toBe(202);

    await waitFor(
      () => prisma.paymentEvent.findFirst({ where: { paymentOrderId: order.id } }),
      (e) => e?.processedAt != null,
    );

    const finalOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("PROCESSING");
  });

  it("blocks an invalid regression: a REJECTED webhook cannot downgrade an already-APPROVED order", async () => {
    const { order } = await createOrder("APPROVED");
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/bold")
      .send({ reference_id: order.publicReference, status: "REJECTED" });
    expect(response.status).toBe(202);

    await waitFor(
      () => prisma.paymentEvent.findFirst({ where: { paymentOrderId: order.id } }),
      (e) => e?.processedAt != null,
    );

    const finalOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("APPROVED");
  });

  it("concurrent duplicate delivery: two simultaneous identical requests still result in exactly one PaymentEvent", async () => {
    const { order } = await createOrder("PROCESSING");
    const body = { reference_id: order.publicReference, status: "APPROVED" };

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/webhooks/bold").send(body),
      request(app.getHttpServer()).post("/api/v1/webhooks/bold").send(body),
    ]);
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);

    await waitFor(
      () => prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } }),
      (o) => o.status === "APPROVED",
    );

    const events = await prisma.paymentEvent.count({ where: { paymentOrderId: order.id } });
    expect(events).toBe(1);
  });

  it("does not require authentication", async () => {
    const { order } = await createOrder("PROCESSING");
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/bold")
      .send({ reference_id: order.publicReference, status: "APPROVED" });
    expect(response.status).not.toBe(401);

    // The controller ACKs before processDelivery() (fire-and-forget)
    // finishes - without waiting for it to settle here, a straggling
    // receipt-issuance write can still land after afterAll's own
    // cleanup has already run, violating payment_receipts' FK into
    // payment_orders.
    await waitFor(
      () => prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } }),
      (o) => o.status === "APPROVED",
    );
  });

  it("never leaks internal database ids in the acknowledgement response", async () => {
    const { order } = await createOrder("PROCESSING");
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/bold")
      .send({ reference_id: order.publicReference, status: "APPROVED" });
    expect(response.body).toEqual({ status: "received" });

    // Same reasoning as the test above - wait for the fire-and-forget
    // processDelivery() to fully settle before this test returns.
    await waitFor(
      () => prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } }),
      (o) => o.status === "APPROVED",
    );
  });
});
