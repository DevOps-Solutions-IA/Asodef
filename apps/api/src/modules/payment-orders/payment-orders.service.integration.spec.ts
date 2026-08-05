import { randomUUID } from "node:crypto";
import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";
import { upsertActivePlanDemo } from "../../database/seed-payments";
import { AuditService } from "../audit/audit.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import { ConsentService } from "../consent/consent.service";
import type { RequestContext } from "../auth/auth.service";
import { PaymentOrdersService } from "./payment-orders.service";

function buildConfigService(ttlMinutes = 30) {
  return { get: () => ttlMinutes } as unknown as ConstructorParameters<typeof PaymentOrdersService>[1];
}

const REQUEST_CONTEXT: RequestContext = { ipAddress: "203.0.113.10", userAgent: "vitest", requestId: null };

describe("PaymentOrdersService (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  let service: PaymentOrdersService;
  const createdCustomerIds: string[] = [];
  const createdPlanIds: string[] = [];
  let terminosHandle: PublishedForTestHandle | null = null;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    service = new PaymentOrdersService(
      prisma as unknown as ConstructorParameters<typeof PaymentOrdersService>[0],
      buildConfigService(),
      new AuditService(),
      new LegalDocumentsService(prisma as unknown as ConstructorParameters<typeof LegalDocumentsService>[0], new AuditService()),
      new ConsentService(prisma as unknown as ConstructorParameters<typeof ConsentService>[0]),
    );

    // US-046: payment_terms consent requires a resolvable, currently
    // PUBLISHED terminos-de-pago version - see publishDraftForTest's own
    // doc comment for why/how this is set up and always restored.
    terminosHandle = await publishDraftForTest(prisma, "terminos-de-pago");
  });

  afterAll(async () => {
    if (terminosHandle) {
      await terminosHandle.restore();
    }
    if (createdCustomerIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (createdPlanIds.length > 0) {
      await prisma.plan.updateMany({ where: { id: { in: createdPlanIds } }, data: { currentVersionId: null } });
      await prisma.planVersion.deleteMany({ where: { planId: { in: createdPlanIds } } });
      await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
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

    const plan = await upsertActivePlanDemo(prisma);

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

  /** A dedicated (not shared) Plan/PlanVersion pair, used only by the
   * version-pinning Example test below - bumping versions on the
   * globally-shared "Plan Demo" fixture would be unsafe for every
   * other test in this suite. */
  async function createCustomerWithDedicatedPlanObligation() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `dedicated-plan-${randomUUID()}`,
        fullName: "Cliente Plan Dedicado",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await prisma.plan.create({ data: { name: `Plan Dedicado ${randomUUID()}` } });
    createdPlanIds.push(plan.id);
    const versionOne = await prisma.planVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        internalName: "Plan Dedicado v1",
        publicName: "Plan Dedicado v1",
        description: "Versión 1 de prueba.",
        priceCents: 200_000,
        billingFrequency: "mensual",
        status: "ACTIVE",
      },
    });
    await prisma.plan.update({ where: { id: plan.id }, data: { currentVersionId: versionOne.id } });

    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Obligación con plan dedicado",
        amountCents: 200_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    return { plan, versionOne, obligation };
  }

  it("Example (AC): records the exact PlanVersion accepted at creation time, unchanged even after the plan is later edited to a new version", async () => {
    const { plan, versionOne, obligation } = await createCustomerWithDedicatedPlanObligation();

    const order = await service.create(obligation.id, REQUEST_CONTEXT);
    expect(order.planVersionAcceptedId).toBe(versionOne.id);

    // Edit the plan to version 2 - version 1 is retired, version 2
    // becomes the new current/ACTIVE version.
    const versionTwo = await prisma.planVersion.create({
      data: {
        planId: plan.id,
        version: 2,
        internalName: "Plan Dedicado v2",
        publicName: "Plan Dedicado v2",
        description: "Versión 2 de prueba.",
        priceCents: 250_000,
        billingFrequency: "mensual",
        status: "ACTIVE",
      },
    });
    await prisma.planVersion.update({ where: { id: versionOne.id }, data: { status: "RETIRED" } });
    await prisma.plan.update({ where: { id: plan.id }, data: { currentVersionId: versionTwo.id } });

    const reloaded = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.planVersionAcceptedId).toBe(versionOne.id);
    expect(reloaded.planVersionAcceptedId).not.toBe(versionTwo.id);
  });

  it("Negative case (AC): an obligation whose plan is SUSPENDED (not ACTIVE) returns 409, no order created", async () => {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `suspended-plan-${randomUUID()}`,
        fullName: "Cliente Plan Suspendido",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await prisma.plan.create({ data: { name: `Plan Suspendido Servicio ${randomUUID()}` } });
    createdPlanIds.push(plan.id);
    const version = await prisma.planVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        internalName: "Plan Suspendido",
        publicName: "Plan Suspendido",
        description: "Plan de prueba suspendido.",
        priceCents: 150_000,
        billingFrequency: "mensual",
        status: "SUSPENDED",
      },
    });
    await prisma.plan.update({ where: { id: plan.id }, data: { currentVersionId: version.id } });

    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Obligación con plan suspendido",
        amountCents: 150_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    await expect(service.create(obligation.id, REQUEST_CONTEXT)).rejects.toThrow(ConflictException);
    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(0);
  });

  it("creates a new PENDING PaymentOrder for an outstanding obligation, with amount/currency taken from the obligation", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const order = await service.create(obligation.id, REQUEST_CONTEXT);

    expect(order.status).toBe("PENDING");
    expect(order.amountCents).toBe(1_234_500);
    expect(order.currency).toBe("COP");
    expect(order.obligationId).toBe(obligation.id);
    expect(order.publicReference).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(order.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // US-046: creating an order now also records durable payment_terms
    // consent evidence for the order's customer, tied to a real
    // LegalDocumentVersion (not left null when one is resolvable).
    const consentPurpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "payment_terms" } });
    const consentRecord = await prisma.consentRecord.findFirst({
      where: { customerId: order.customerId, consentPurposeId: consentPurpose.id },
    });
    expect(consentRecord).not.toBeNull();
    expect(consentRecord?.status).toBe("GRANTED");
    expect(consentRecord?.legalDocumentVersionId).not.toBeNull();
  });

  it("Example (AC): calling create() twice in a row for the same obligation returns the same publicReference both times", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const first = await service.create(obligation.id, REQUEST_CONTEXT);
    const second = await service.create(obligation.id, REQUEST_CONTEXT);

    expect(second.publicReference).toBe(first.publicReference);
    expect(second.id).toBe(first.id);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(1);
  });

  it("mints a new order once the previous PENDING order has expired", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const first = await service.create(obligation.id, REQUEST_CONTEXT);
    await prisma.paymentOrder.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const second = await service.create(obligation.id, REQUEST_CONTEXT);

    expect(second.publicReference).not.toBe(first.publicReference);
    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(2);
  });

  it("OVERDUE is still an outstanding (payable) status", async () => {
    const { obligation } = await createCustomerWithObligation("OVERDUE");
    const order = await service.create(obligation.id, REQUEST_CONTEXT);
    expect(order.status).toBe("PENDING");
  });

  it("Negative case (AC): create() for an already fully paid obligation returns 409 and creates no order", async () => {
    const { obligation } = await createCustomerWithObligation("PAID");

    await expect(service.create(obligation.id, REQUEST_CONTEXT)).rejects.toThrow(ConflictException);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(0);
  });

  it("a CANCELLED obligation is also ineligible - 409, no order created", async () => {
    const { obligation } = await createCustomerWithObligation("CANCELLED");

    await expect(service.create(obligation.id, REQUEST_CONTEXT)).rejects.toThrow(ConflictException);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(0);
  });

  it("a non-existent obligation id throws NotFoundException", async () => {
    await expect(service.create(randomUUID(), REQUEST_CONTEXT)).rejects.toThrow(NotFoundException);
  });

  it("concurrent duplicate prevention: N simultaneous create() calls for the same obligation create exactly one order", async () => {
    const { obligation } = await createCustomerWithObligation("PENDING");

    const results = await Promise.all(Array.from({ length: 10 }, () => service.create(obligation.id, REQUEST_CONTEXT)));

    const uniqueReferences = new Set(results.map((order) => order.publicReference));
    expect(uniqueReferences.size).toBe(1);

    const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
    expect(orderCount).toBe(1);
  });

  it("Negative case (AC US-046): with no resolvable payment_terms policy version, create() fails closed and no order is created", async () => {
    if (!terminosHandle) {
      // beforeAll couldn't find a DRAFT terminos-de-pago to publish
      // (e.g. it was already published by something else) - nothing to
      // safely unpublish here without risking a permanent side effect,
      // so this scenario is only exercised when the setup precondition
      // actually held.
      return;
    }

    await terminosHandle.unpublish();
    try {
      const { obligation } = await createCustomerWithObligation("PENDING");

      await expect(service.create(obligation.id, REQUEST_CONTEXT)).rejects.toThrow(BadRequestException);

      const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
      expect(orderCount).toBe(0);
    } finally {
      await terminosHandle.republish();
    }
  });
});
