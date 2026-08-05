import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConsentStatus, Prisma, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import { ConsentService } from "./consent.service";
import type { RecordConsentRequestMeta } from "./consent.types";

const REQ: RecordConsentRequestMeta = {
  ipAddress: "203.0.113.5",
  userAgent: "vitest",
  source: "test",
  acceptanceMethod: "checkbox",
};

describe("ConsentService (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  let service: ConsentService;
  const createdCustomerIds: string[] = [];
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
    service = new ConsentService(prisma as unknown as ConstructorParameters<typeof ConsentService>[0]);
  });

  afterAll(async () => {
    // ConsentRecord rows must go first - they hold Restrict FKs into
    // both legal_document_versions and customers, so either parent
    // delete below would otherwise fail. Includes anonymous records
    // (no customerId) tied to a created version, e.g. the US-047
    // anonymous-subject test.
    if (createdCustomerIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    }
    if (createdDocumentIds.length > 0) {
      const versionIds = (
        await prisma.legalDocumentVersion.findMany({ where: { legalDocumentId: { in: createdDocumentIds } }, select: { id: true } })
      ).map((v) => v.id);
      await prisma.consentRecord.deleteMany({ where: { legalDocumentVersionId: { in: versionIds } } });
      await prisma.legalDocument.updateMany({ where: { id: { in: createdDocumentIds } }, data: { currentVersionId: null } });
      await prisma.legalDocumentVersion.deleteMany({ where: { legalDocumentId: { in: createdDocumentIds } } });
      await prisma.legalDocument.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await prisma.$disconnect();
  });

  async function createCustomer() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `consent-test-${randomUUID()}`,
        fullName: "Cliente de Prueba de Consentimiento",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);
    return customer;
  }

  async function createPublishedVersion() {
    const document = await prisma.legalDocument.create({
      data: { type: "test_type", title: "Documento de prueba", slug: `consent-test-doc-${randomUUID()}` },
    });
    createdDocumentIds.push(document.id);
    const version = await prisma.legalDocumentVersion.create({
      data: {
        legalDocumentId: document.id,
        version: 1,
        status: "PUBLISHED",
        draftContent: { sections: [] },
        approvedContent: { sections: [] },
        publicationDate: new Date(),
      },
    });
    await prisma.legalDocument.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
    return version;
  }

  it("Example (AC): records a GRANTED consent tied to a resolvable policy version", async () => {
    const customer = await createCustomer();
    const version = await createPublishedVersion();

    const result = await prisma.$transaction((tx) =>
      service.record(tx, "data_processing", { customerId: customer.id }, version.id, REQ),
    );

    expect(result.status).toBe("GRANTED");
    expect(result.legalDocumentVersionId).toBe(version.id);

    const record = await prisma.consentRecord.findUniqueOrThrow({ where: { id: result.id } });
    expect(record.customerId).toBe(customer.id);
    expect(record.ipAddress).toBe(REQ.ipAddress);
    expect(record.userAgent).toBe(REQ.userAgent);
    expect(record.source).toBe(REQ.source);
    expect(record.acceptanceMethod).toBe(REQ.acceptanceMethod);
  });

  it("US-047: records an explicit DENIED status for an anonymous subject (no userId/leadSubmissionId/customerId)", async () => {
    const version = await createPublishedVersion();

    const result = await prisma.$transaction((tx) =>
      service.record(
        tx,
        "data_processing",
        { anonymous: true },
        version.id,
        { ...REQ, metadata: { category: "test" } },
        ConsentStatus.DENIED,
      ),
    );

    expect(result.status).toBe("DENIED");

    const record = await prisma.consentRecord.findUniqueOrThrow({ where: { id: result.id } });
    expect(record.userId).toBeNull();
    expect(record.leadSubmissionId).toBeNull();
    expect(record.customerId).toBeNull();
    expect(record.metadata).toEqual({ category: "test" });
  });

  it("a purpose that doesn't require a policy version can be recorded with null", async () => {
    const customer = await createCustomer();

    const result = await prisma.$transaction((tx) => service.record(tx, "optional_marketing", { customerId: customer.id }, null, REQ));

    expect(result.legalDocumentVersionId).toBeNull();
  });

  it("Negative case (AC): a purpose key that doesn't exist returns a validation error, creates no record", async () => {
    const customer = await createCustomer();

    await expect(
      prisma.$transaction((tx) => service.record(tx, "not_a_real_purpose", { customerId: customer.id }, null, REQ)),
    ).rejects.toThrow(BadRequestException);

    const count = await prisma.consentRecord.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it("Negative case (AC): a purpose that requires a policy version with none given returns a validation error, creates no record", async () => {
    const customer = await createCustomer();

    await expect(
      prisma.$transaction((tx) => service.record(tx, "data_processing", { customerId: customer.id }, null, REQ)),
    ).rejects.toThrow(BadRequestException);

    const count = await prisma.consentRecord.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it("a policyVersionId that doesn't resolve to any real LegalDocumentVersion returns a validation error", async () => {
    const customer = await createCustomer();

    await expect(
      prisma.$transaction((tx) => service.record(tx, "data_processing", { customerId: customer.id }, randomUUID(), REQ)),
    ).rejects.toThrow(BadRequestException);
  });

  it("Bug regression (US-046): deleting a customer whose only subject reference is on a consent record succeeds - SetNull, not a constraint violation", async () => {
    // The DB CHECK is deliberately "at most one" subject, not "exactly
    // one" - a "=1" check is incompatible with onDelete: SetNull on
    // these columns, since deleting the subject nulls its FK out. This
    // exact scenario originally hung/failed an integration test's own
    // afterAll cleanup when the constraint was still "=1" - see the
    // schema's own doc comment on ConsentRecord.
    const customer = await createCustomer();
    const created = await prisma.$transaction((tx) => service.record(tx, "optional_marketing", { customerId: customer.id }, null, REQ));

    await expect(prisma.customer.delete({ where: { id: customer.id } })).resolves.toBeDefined();

    const record = await prisma.consentRecord.findUniqueOrThrow({ where: { id: created.id } });
    expect(record.customerId).toBeNull();

    await prisma.consentRecord.delete({ where: { id: created.id } });
    createdCustomerIds.splice(createdCustomerIds.indexOf(customer.id), 1);
  });

  it("database-level: a raw insert with zero subjects is allowed (the legitimate post-erasure state)", async () => {
    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "optional_marketing" } });

    const record = await prisma.consentRecord.create({
      data: { consentPurposeId: purpose.id, status: "GRANTED", source: "test", acceptanceMethod: "checkbox" },
    });

    expect(record.userId).toBeNull();
    expect(record.leadSubmissionId).toBeNull();
    expect(record.customerId).toBeNull();

    await prisma.consentRecord.delete({ where: { id: record.id } });
  });

  it("database-level: a raw insert with two subjects at once is rejected", async () => {
    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "optional_marketing" } });
    const customer = await createCustomer();

    await expect(
      prisma.consentRecord.create({
        data: {
          consentPurposeId: purpose.id,
          customerId: customer.id,
          userId: randomUUID(),
          status: "GRANTED",
          source: "test",
          acceptanceMethod: "checkbox",
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientUnknownRequestError);
  });

  it("revoke() sets status=REVOKED and stamps revokedAt", async () => {
    const customer = await createCustomer();
    const created = await prisma.$transaction((tx) => service.record(tx, "optional_marketing", { customerId: customer.id }, null, REQ));

    const revoked = await service.revoke(created.id);

    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).not.toBeNull();

    const record = await prisma.consentRecord.findUniqueOrThrow({ where: { id: created.id } });
    expect(record.status).toBe("REVOKED");
    expect(record.revokedAt).not.toBeNull();
  });

  it("revoke() for a non-existent id throws NotFoundException", async () => {
    await expect(service.revoke(randomUUID())).rejects.toThrow(NotFoundException);
  });
});
