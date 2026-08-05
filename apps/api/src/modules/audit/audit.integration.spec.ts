import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";
import { upsertActivePlanDemo } from "../../database/seed-payments";

describe("Audit wiring for the payment domain (integration, real HTTP, BOLD_MODE=mock)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];
  let terminosHandle: PublishedForTestHandle | null = null;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // US-046: order creation now records payment_terms consent, which
    // requires a resolvable, currently PUBLISHED terminos-de-pago
    // version - see publishDraftForTest's own doc comment.
    terminosHandle = await publishDraftForTest(prisma as unknown as PrismaClient, "terminos-de-pago");
  });

  afterAll(async () => {
    if (terminosHandle) {
      await terminosHandle.restore();
    }
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

  async function createCustomerWithObligation(documentNumber: string) {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber,
        fullName: "Cliente Auditoría de Prueba",
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
        concept: "Cuota auditoría de prueba",
        amountCents: 444_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    return { customer, obligation };
  }

  it("Example (AC): a full lookup -> order -> mock-Bold-approve flow produces a chronologically ordered AuditLog trail matching each transition", async () => {
    const documentNumber = `audit-${randomUUID()}`;
    const { obligation } = await createCustomerWithObligation(documentNumber);

    const lookup = await request(app.getHttpServer()).post("/api/v1/payments/lookup").send({ documentType: "CC", documentNumber });
    expect(lookup.status).toBe(200);

    const created = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });
    expect(created.status).toBe(201);
    const reference = created.body.publicReference;

    const boldCreate = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference });
    expect(boldCreate.status).toBe(201);
    expect(boldCreate.body.orderStatus).toBe("APPROVED");

    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { publicReference: reference } });
    const trail = await prisma.auditLog.findMany({ where: { paymentOrderId: order.id }, orderBy: { createdAt: "asc" } });

    // Three real transitions happen for a mock order that resolves
    // instantly: created (null->PENDING), the pre-provider-call
    // PENDING->PROCESSING write, then the post-provider-response
    // PROCESSING->APPROVED write - every one of them audited, matching
    // the AC's "matching each transition" literally.
    expect(trail).toHaveLength(3);
    expect(trail[0]).toMatchObject({ action: "order.created", previousStatus: null, newStatus: "PENDING", applied: true, source: "ORDER_CREATE" });
    expect(trail[1]).toMatchObject({
      action: "order.status_transition",
      previousStatus: "PENDING",
      newStatus: "PROCESSING",
      applied: true,
      source: "BOLD_CREATE",
    });
    expect(trail[2]).toMatchObject({
      action: "order.status_transition",
      previousStatus: "PROCESSING",
      newStatus: "APPROVED",
      applied: true,
      source: "BOLD_CREATE",
    });
    expect(trail[1]!.createdAt.getTime()).toBeGreaterThanOrEqual(trail[0]!.createdAt.getTime());
    expect(trail[2]!.createdAt.getTime()).toBeGreaterThanOrEqual(trail[1]!.createdAt.getTime());
  });

  it("Negative case (AC): a webhook that doesn't result in a state change still logs an audit entry indicating no-op, not silence", async () => {
    const documentNumber = `audit-noop-${randomUUID()}`;
    const { obligation } = await createCustomerWithObligation(documentNumber);

    const created = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });
    const reference = created.body.publicReference;
    await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference }); // resolves to APPROVED (mock default)

    // A REJECTED event for an order that's already APPROVED must not
    // regress the order, but must still be audited as an attempted,
    // blocked transition - never silence.
    const webhookResponse = await request(app.getHttpServer()).post("/api/v1/webhooks/bold").send({ reference_id: reference, status: "REJECTED" });
    expect(webhookResponse.status).toBe(202);

    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { publicReference: reference } });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const blockedEntries = await prisma.auditLog.findMany({
      where: { paymentOrderId: order.id, source: "WEBHOOK", applied: false },
    });
    expect(blockedEntries).toHaveLength(1);
    expect(blockedEntries[0]).toMatchObject({ previousStatus: "APPROVED", newStatus: "REJECTED", applied: false });

    const finalOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("APPROVED");
  });

  it("does not create an AuditLog entry for a read-only lookup (no order ever exists for this customer)", async () => {
    const documentNumber = `audit-readonly-${randomUUID()}`;
    const { customer } = await createCustomerWithObligation(documentNumber);

    await request(app.getHttpServer()).post("/api/v1/payments/lookup").send({ documentType: "CC", documentNumber });

    const auditCount = await prisma.auditLog.count({ where: { paymentOrder: { customerId: customer.id } } });
    expect(auditCount).toBe(0);
  });
});
