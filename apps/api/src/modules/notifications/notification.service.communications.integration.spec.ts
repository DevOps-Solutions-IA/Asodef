import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { seedCommunicationTemplates } from "../../database/seed-communication-templates";
import { seedConsentPurposes } from "../../database/seed-consent-purposes";
import { NotificationService } from "./notification.service";

describe("NotificationService.send()/unsubscribe() - US-059 (integration, real Postgres)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let notificationService: NotificationService;
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    notificationService = app.get(NotificationService);

    await seedConsentPurposes(prisma);
    await seedCommunicationTemplates(prisma);
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await app.close();
  });

  async function createCustomerWithGrantedMarketingConsent() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `communications-test-${randomUUID()}`,
        fullName: "Cliente Comunicaciones de Prueba",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "optional_marketing" } });
    await prisma.consentRecord.create({
      data: {
        consentPurposeId: purpose.id,
        customerId: customer.id,
        status: "GRANTED",
        source: "test",
        acceptanceMethod: "explicit_action",
      },
    });

    return customer;
  }

  async function createCustomerWithNoConsent() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `communications-test-${randomUUID()}`,
        fullName: "Cliente Sin Consentimiento",
        email: `${randomUUID()}@example.com`,
        phone: "3000000001",
      },
    });
    createdCustomerIds.push(customer.id);
    return customer;
  }

  async function cleanupSuppressionEntry(channel: string, recipient: string) {
    await prisma.suppressionListEntry.deleteMany({ where: { channel, recipient } });
  }

  it("returns 404-equivalent (throws) for an unknown template key", async () => {
    await expect(notificationService.send("this-template-does-not-exist", "someone@example.com", {})).rejects.toThrow();
  });

  it("fails closed when a consented marketing template has no real delivery transport", async () => {
    const customer = await createCustomerWithGrantedMarketingConsent();

    const log = await notificationService.send("general_marketing", customer.email, { name: customer.fullName });

    expect(log.status).toBe("FAILED");
    expect(log.sentAt).toBeNull();
    expect(log.channel).toBe("email");
    expect(log.errorCategory).toBe("transport_not_implemented");
  });

  it("Example (AC): the same marketing template for a suppressed recipient logs status='SUPPRESSED'", async () => {
    const customer = await createCustomerWithGrantedMarketingConsent();
    await prisma.suppressionListEntry.create({
      data: { channel: "email", recipient: customer.email, reason: "Prueba de supresión." },
    });

    try {
      const log = await notificationService.send("general_marketing", customer.email, {});
      expect(log.status).toBe("SUPPRESSED");
      expect(log.errorCategory).toBe("suppression_list_entry");
    } finally {
      await cleanupSuppressionEntry("email", customer.email);
    }
  });

  it("a marketing template for a recipient with no consent record at all logs status='SUPPRESSED'", async () => {
    const customer = await createCustomerWithNoConsent();

    const log = await notificationService.send("general_marketing", customer.email, {});

    expect(log.status).toBe("SUPPRESSED");
    expect(log.errorCategory).toBe("marketing_consent_not_granted");
  });

  it("does not suppress a transactional template after marketing revocation, but still fails closed without a transport", async () => {
    const customer = await createCustomerWithGrantedMarketingConsent();
    await notificationService.unsubscribe("email", customer.email, "Prueba de baja.");

    try {
      const revokedRecord = await prisma.consentRecord.findFirst({ where: { customerId: customer.id } });
      expect(revokedRecord?.status).toBe("DENIED");

      const log = await notificationService.send("payment_result", customer.email, { amount: 100_000 });
      expect(log.status).toBe("FAILED");
      expect(log.errorCategory).toBe("transport_not_implemented");
    } finally {
      await cleanupSuppressionEntry("email", customer.email);
    }
  });

  it("unsubscribe() adds a SuppressionListEntry and revokes the GRANTED optional_marketing ConsentRecord", async () => {
    const customer = await createCustomerWithGrantedMarketingConsent();

    await notificationService.unsubscribe("email", customer.email, "Ya no deseo recibir comunicaciones.");

    try {
      const suppression = await prisma.suppressionListEntry.findUnique({
        where: { channel_recipient: { channel: "email", recipient: customer.email } },
      });
      expect(suppression).not.toBeNull();
      expect(suppression?.reason).toBe("Ya no deseo recibir comunicaciones.");

      const record = await prisma.consentRecord.findFirst({ where: { customerId: customer.id } });
      expect(record?.status).toBe("DENIED");
      expect(record?.revokedAt).not.toBeNull();
    } finally {
      await cleanupSuppressionEntry("email", customer.email);
    }
  });

  it("unsubscribe() is idempotent - calling it twice for the same channel+recipient does not throw", async () => {
    const customer = await createCustomerWithGrantedMarketingConsent();

    try {
      await notificationService.unsubscribe("email", customer.email, "Primera solicitud.");
      await expect(notificationService.unsubscribe("email", customer.email, "Segunda solicitud.")).resolves.not.toThrow();
    } finally {
      await cleanupSuppressionEntry("email", customer.email);
    }
  });
});
