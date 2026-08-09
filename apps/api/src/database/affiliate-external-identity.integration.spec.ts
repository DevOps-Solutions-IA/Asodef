import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";
import { AffiliateIdentityService } from "../modules/self-service/affiliate-identity.service";
import { SelfServiceCryptoService } from "../modules/self-service/self-service-crypto.service";

describe("Affiliate external identity constraints (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  const customerIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    if (customerIds.length === 0) return;
    const affiliates = await prisma.affiliate.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true },
    });
    await prisma.affiliateExternalIdentity.deleteMany({
      where: { affiliateId: { in: affiliates.map(({ id }) => id) } },
    });
    await prisma.affiliate.deleteMany({
      where: { customerId: { in: customerIds } },
    });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    customerIds.length = 0;
  });

  afterAll(async () => prisma.$disconnect());

  async function createAffiliate(label: string) {
    const suffix = randomUUID();
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `identity-${suffix}`,
        fullName: `Identity Test ${label}`,
        email: `${suffix}@example.com`,
        phone: "3000000000",
      },
    });
    customerIds.push(customer.id);
    return prisma.affiliate.create({
      data: { customerId: customer.id, affiliateNumber: `AFF-${suffix}` },
    });
  }

  it("enforces one subject and one affiliate per issuer at the database level", async () => {
    const first = await createAffiliate("first");
    const second = await createAffiliate("second");
    const issuer = "https://identity.example.com";
    const firstHash = "a".repeat(64);
    await prisma.affiliateExternalIdentity.create({
      data: { affiliateId: first.id, issuer, subjectRefHash: firstHash },
    });

    await expect(
      prisma.affiliateExternalIdentity.create({
        data: { affiliateId: second.id, issuer, subjectRefHash: firstHash },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);

    await expect(
      prisma.affiliateExternalIdentity.create({
        data: { affiliateId: first.id, issuer, subjectRefHash: "b".repeat(64) },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("rejects malformed hashes and preserves the affiliate while a mapping exists", async () => {
    const affiliate = await createAffiliate("constraints");
    const identity = await prisma.affiliateExternalIdentity.create({
      data: {
        affiliateId: affiliate.id,
        issuer: "https://identity.example.com",
        subjectRefHash: "c".repeat(64),
      },
    });

    await expect(
      prisma.affiliate.delete({ where: { id: affiliate.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.affiliateExternalIdentity.create({
        data: {
          affiliateId: affiliate.id,
          issuer: "different-issuer",
          subjectRefHash: "too-short",
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.affiliateExternalIdentity.create({
        data: {
          affiliateId: affiliate.id,
          issuer: "third-issuer",
          subjectRefHash: "z".repeat(64),
        },
      }),
    ).rejects.toBeDefined();

    await prisma.affiliateExternalIdentity.delete({
      where: { id: identity.id },
    });
  });

  it("contains no column capable of storing the raw external subject", async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_external_identities'
    `;
    const names = columns.map(({ column_name }) => column_name);
    expect(names).toContain("subject_ref_hash");
    expect(names).not.toContain("subject_ref");
  });

  it("links and resolves a case-sensitive opaque subject through the real database", async () => {
    const affiliate = await createAffiliate("service-roundtrip");
    const issuer = "https://identity-roundtrip.example.com";
    const config = {
      get: (key: string) => {
        if (key === "EXTERNAL_CORE_PROVIDER") return "http";
        if (key === "EXTERNAL_CORE_IDENTITY_ISSUER") return issuer;
        if (key === "EXTERNAL_IDENTITY_HMAC_KEY")
          return "integration-identity-hmac-key-at-least-32-characters";
        if (key === "ENCRYPTION_KEY")
          return "integration-encryption-key-at-least-32-characters";
        return undefined;
      },
    };
    const crypto = new SelfServiceCryptoService(config as never);
    const service = new AffiliateIdentityService(
      prisma as never,
      config as never,
      crypto,
    );

    await expect(
      service.linkVerifiedSubject(affiliate.id, "Subject-ABC"),
    ).resolves.toMatchObject({
      affiliateId: affiliate.id,
      issuer,
    });
    await expect(service.resolveSubject("Subject-ABC")).resolves.toMatchObject({
      affiliateId: affiliate.id,
    });
    await expect(service.resolveSubject("subject-abc")).rejects.toMatchObject({
      status: 401,
    });

    const stored = await prisma.affiliateExternalIdentity.findFirstOrThrow({
      where: { affiliateId: affiliate.id },
    });
    expect(stored.subjectRefHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain("Subject-ABC");
  });
});
