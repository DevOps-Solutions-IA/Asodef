import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { AuditService } from "../audit/audit.service";
import { PaymentOrdersService } from "./payment-orders.service";

function buildConfigService(ttlMinutes = 30) {
  return { get: () => ttlMinutes } as unknown as ConstructorParameters<typeof PaymentOrdersService>[1];
}

describe("PaymentOrdersService (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  let service: PaymentOrdersService;
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    service = new PaymentOrdersService(
      prisma as unknown as ConstructorParameters<typeof PaymentOrdersService>[0],
      buildConfigService(),
      new AuditService(),
    );
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await prisma.$disconnect();
  });

  async function createCustomerWithObligation(status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" = "PENDING") {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `test-${randomUUID()}`,
        fullName: "Cliente de Prueba",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await prisma.plan.upsert({
      where: { name: "Plan Demo" },
      update: {},
      create: { name: "Plan Demo", description: "Plan de prueba para entorno local.", active: true },
    });

    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Obligación de prueba",
        amountCents: 1_234_500,
        currency: "COP",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status,
      },
    });

    return { customer, obligation };
  }

  it("creates a new PENDING PaymentOrder for an outstanding obligation, with amount/currency taken from the obligation", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const order = await service.create(obligation.id);

    expect(order.status).toBe("PENDING");
    expect(order.amountCents).toBe(1_234_500);
    expect(order.currency).toBe("COP");
    expect(order.obligationId).toBe(obligation.id);
    expect(order.publicReference).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(order.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("Example (AC): calling create() twice in a row for the same obligation returns the same publicReference both times", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const first = await service.create(obligation.id);
    const second = await service.create(obligation.id);

    expect(second.publicReference).toBe(first.publicReference);
    expect(second.id).toBe(first.id);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(1);
  });

  it("mints a new order once the previous PENDING order has expired", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const first = await service.create(obligation.id);
    await prisma.paymentOrder.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const second = await service.create(obligation.id);

    expect(second.publicReference).not.toBe(first.publicReference);
    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(2);
  });

  it("OVERDUE is still an outstanding (payable) status", async () => {
    const { obligation } = await createCustomerWithObligation("OVERDUE");
    const order = await service.create(obligation.id);
    expect(order.status).toBe("PENDING");
  });

  it("Negative case (AC): create() for an already fully paid obligation returns 409 and creates no order", async () => {
    const { obligation } = await createCustomerWithObligation("PAID");

    await expect(service.create(obligation.id)).rejects.toThrow(ConflictException);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(0);
  });

  it("a CANCELLED obligation is also ineligible - 409, no order created", async () => {
    const { obligation } = await createCustomerWithObligation("CANCELLED");

    await expect(service.create(obligation.id)).rejects.toThrow(ConflictException);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(0);
  });

  it("a non-existent obligation id throws NotFoundException", async () => {
    await expect(service.create(randomUUID())).rejects.toThrow(NotFoundException);
  });

  it("concurrent duplicate prevention: N simultaneous create() calls for the same obligation create exactly one order", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const results = await Promise.all(Array.from({ length: 10 }, () => service.create(obligation.id)));

    const uniqueReferences = new Set(results.map((order) => order.publicReference));
    expect(uniqueReferences.size).toBe(1);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(1);
  });
});
