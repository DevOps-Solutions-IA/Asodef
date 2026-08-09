import { randomUUID } from "node:crypto";
import { AffiliateExternalIdentityStatus, Prisma, PrismaClient } from "@prisma/client";
import { AffiliateIdentityService } from "../modules/self-service/affiliate-identity.service";
import { ExternalIdentityFingerprintService } from "../modules/self-service/external-identity-fingerprint.service";
import { createTestPrismaClient } from "./test-db-client";

describe("Affiliate identity lifecycle (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  const customerIds: string[] = [];
  const issuer = "https://identity.integration.example.com";
  const v1Secret = "integration-identity-v1-key-at-least-32-characters";
  const v2Secret = "integration-identity-v2-key-at-least-32-characters";

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
    const affiliateIds = affiliates.map(({ id }) => id);
    await prisma.affiliateExternalIdentity.updateMany({
      where: {
        affiliateId: { in: affiliateIds },
        status: AffiliateExternalIdentityStatus.REPLACED,
      },
      data: {
        status: AffiliateExternalIdentityStatus.REVOKED,
        replacedByIdentityId: null,
      },
    });
    await prisma.affiliateExternalIdentityFingerprint.deleteMany({
      where: { identity: { affiliateId: { in: affiliateIds } } },
    });
    await prisma.affiliateExternalIdentity.deleteMany({
      where: { affiliateId: { in: affiliateIds } },
    });
    await prisma.affiliate.deleteMany({ where: { id: { in: affiliateIds } } });
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

  function service(
    activeKeyId = "v2",
    activeSecret = v2Secret,
    previous: Record<string, string> = { v1: v1Secret },
  ) {
    const config = {
      get: (key: string) => {
        if (key === "EXTERNAL_CORE_PROVIDER") return "http";
        if (key === "EXTERNAL_CORE_IDENTITY_ISSUER") return issuer;
        if (key === "EXTERNAL_IDENTITY_HMAC_KEY_ID") return activeKeyId;
        if (key === "EXTERNAL_IDENTITY_HMAC_KEY") return activeSecret;
        if (key === "EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS") return previous;
        return undefined;
      },
    };
    const fingerprints = new ExternalIdentityFingerprintService(config as never);
    return new AffiliateIdentityService(prisma as never, config as never, fingerprints);
  }

  it("allows one concurrent winner when the same subject targets two affiliates", async () => {
    const first = await createAffiliate("first");
    const second = await createAffiliate("second");
    const identity = service();
    const results = await Promise.allSettled([
      identity.linkVerifiedSubject(first.id, "shared-subject"),
      identity.linkVerifiedSubject(second.id, "shared-subject"),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rows = await prisma.affiliateExternalIdentity.findMany({
      where: { issuer, status: AffiliateExternalIdentityStatus.ACTIVE },
      include: { fingerprints: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fingerprints).toHaveLength(2);
  });

  it("replaces an active identity without deleting its history", async () => {
    const affiliate = await createAffiliate("replacement");
    const identity = service();
    const original = await identity.linkVerifiedSubject(affiliate.id, "old-subject");
    const replacement = await identity.replaceVerifiedSubject(
      affiliate.id,
      original.identityId,
      "new-subject",
    );
    const rows = await prisma.affiliateExternalIdentity.findMany({
      where: { affiliateId: affiliate.id, issuer },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: original.identityId,
      status: AffiliateExternalIdentityStatus.REPLACED,
      replacedByIdentityId: replacement.identityId,
    });
    expect(rows[0]?.deactivatedAt).toBeInstanceOf(Date);
    expect(rows[1]).toMatchObject({
      id: replacement.identityId,
      status: AffiliateExternalIdentityStatus.ACTIVE,
    });
    await expect(identity.resolveSubject("old-subject")).rejects.toMatchObject({ status: 401 });
    await expect(identity.resolveSubject("new-subject")).resolves.toMatchObject({
      affiliateId: affiliate.id,
    });
  });

  it("never leaves two incompatible active identities for one affiliate and issuer", async () => {
    const affiliate = await createAffiliate("active-race");
    const identity = service();
    const results = await Promise.allSettled([
      identity.linkVerifiedSubject(affiliate.id, "subject-a"),
      identity.linkVerifiedSubject(affiliate.id, "subject-b"),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(
      prisma.affiliateExternalIdentity.count({
        where: { affiliateId: affiliate.id, issuer, status: AffiliateExternalIdentityStatus.ACTIVE },
      }),
    ).resolves.toBe(1);
  });

  it("does not resolve a revoked identity and permits a newly issued identity", async () => {
    const affiliate = await createAffiliate("revocation");
    const identity = service();
    const original = await identity.linkVerifiedSubject(affiliate.id, "revoked-subject");
    await identity.revokeIdentity(affiliate.id, original.identityId);
    await expect(identity.resolveSubject("revoked-subject")).rejects.toMatchObject({ status: 401 });
    const next = await identity.linkVerifiedSubject(affiliate.id, "newly-issued-subject");
    expect(next.identityId).not.toBe(original.identityId);
    await expect(identity.resolveSubject("newly-issued-subject")).resolves.toMatchObject({
      affiliateId: affiliate.id,
    });
  });

  it("uses overlapping key versions to prevent cross-affiliate remapping during rotation", async () => {
    const first = await createAffiliate("rotation-first");
    const second = await createAffiliate("rotation-second");
    const v1 = service("v1", v1Secret, {});
    const original = await v1.linkVerifiedSubject(first.id, "rotating-subject");
    const rotating = service("v2", v2Secret, { v1: v1Secret });
    await expect(
      rotating.linkVerifiedSubject(second.id, "rotating-subject"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(rotating.resolveSubject("rotating-subject")).resolves.toMatchObject({
      affiliateId: first.id,
    });
    const keyIds = await prisma.affiliateExternalIdentityFingerprint.findMany({
      where: { identityId: original.identityId },
      orderBy: { keyId: "asc" },
      select: { keyId: true },
    });
    expect(keyIds).toEqual([{ keyId: "v1" }, { keyId: "v2" }]);
  });

  it("keeps concurrent idempotent retries on one logical identity", async () => {
    const affiliate = await createAffiliate("idempotency");
    const identity = service();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        identity.linkVerifiedSubject(affiliate.id, "idempotent-subject"),
      ),
    );
    expect(new Set(results.map(({ identityId }) => identityId)).size).toBe(1);
    await expect(
      prisma.affiliateExternalIdentity.count({ where: { affiliateId: affiliate.id, issuer } }),
    ).resolves.toBe(1);
  });

  it("enforces lifecycle and fingerprint invariants directly in PostgreSQL", async () => {
    const affiliate = await createAffiliate("constraints");
    const first = await prisma.affiliateExternalIdentity.create({
      data: { affiliateId: affiliate.id, issuer },
    });
    await expect(
      prisma.affiliateExternalIdentity.create({ data: { affiliateId: affiliate.id, issuer } }),
    ).rejects.toMatchObject({ code: "P2002" } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
    await expect(
      prisma.affiliateExternalIdentity.update({
        where: { id: first.id },
        data: { status: AffiliateExternalIdentityStatus.REVOKED },
      }),
    ).rejects.toBeDefined();
    await prisma.affiliateExternalIdentityFingerprint.create({
      data: { identityId: first.id, issuer, keyId: "v1", subjectRefHash: "a".repeat(64) },
    });
    const otherIssuerIdentity = await prisma.affiliateExternalIdentity.create({
      data: { affiliateId: affiliate.id, issuer: `${issuer}/other` },
    });
    await expect(
      prisma.affiliateExternalIdentityFingerprint.create({
        data: {
          identityId: otherIssuerIdentity.id,
          issuer,
          keyId: "v1",
          subjectRefHash: "b".repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("stores neither raw external subjects nor unversioned hashes", async () => {
    const identityColumns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_external_identities'
    `;
    const fingerprintColumns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_external_identity_fingerprints'
    `;
    expect(identityColumns.map(({ column_name }) => column_name)).not.toContain("subject_ref");
    expect(identityColumns.map(({ column_name }) => column_name)).not.toContain("subject_ref_hash");
    expect(fingerprintColumns.map(({ column_name }) => column_name)).toEqual(
      expect.arrayContaining(["key_id", "subject_ref_hash"]),
    );
  });
});
