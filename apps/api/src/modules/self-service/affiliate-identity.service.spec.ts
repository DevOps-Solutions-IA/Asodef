import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { AffiliateIdentityService } from "./affiliate-identity.service";

describe("AffiliateIdentityService", () => {
  const issuer = "https://identity.asodef.example";
  const identity = {
    id: "identity-id",
    affiliateId: "affiliate-id",
    issuer,
    subjectRefHash: "opaque-hmac",
    verifiedAt: new Date("2026-08-08T12:00:00.000Z"),
    lastVerifiedAt: new Date("2026-08-08T12:00:00.000Z"),
    createdAt: new Date("2026-08-08T12:00:00.000Z"),
  };

  function setup(provider: "http" | "not_configured" = "http") {
    const transaction = {
      affiliate: {
        findUnique: jest.fn().mockResolvedValue({ id: identity.affiliateId }),
      },
      affiliateExternalIdentity: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      affiliateExternalIdentity: { findUnique: jest.fn() },
      $transaction: jest.fn(
        async (operation: (tx: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === "EXTERNAL_CORE_PROVIDER" ? provider : issuer,
      ),
    };
    const crypto = { fingerprintOpaque: jest.fn(() => "opaque-hmac") };
    const service = new AffiliateIdentityService(
      prisma as never,
      config as never,
      crypto as never,
    );
    return { service, prisma, transaction, crypto };
  }

  it("resolves the external subject to Affiliate.id through issuer plus HMAC only", async () => {
    const { service, prisma, crypto } = setup();
    prisma.affiliateExternalIdentity.findUnique.mockResolvedValue({
      affiliateId: identity.affiliateId,
      issuer,
      verifiedAt: identity.verifiedAt,
    });

    await expect(
      service.resolveSubject("Case-Sensitive-Subject"),
    ).resolves.toEqual({
      affiliateId: identity.affiliateId,
      issuer,
      verifiedAt: identity.verifiedAt,
    });
    expect(crypto.fingerprintOpaque).toHaveBeenCalledWith(
      "Case-Sensitive-Subject",
    );
    expect(prisma.affiliateExternalIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        issuer_subjectRefHash: { issuer, subjectRefHash: "opaque-hmac" },
      },
      select: { affiliateId: true, issuer: true, verifiedAt: true },
    });
  });

  it("fails closed when the subject has no explicit mapping", async () => {
    const { service, prisma } = setup();
    prisma.affiliateExternalIdentity.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveSubject("unknown-subject"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("fails closed when the trusted provider is not configured", async () => {
    const { service, prisma } = setup("not_configured");
    await expect(service.resolveSubject("subject")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.affiliateExternalIdentity.findUnique).not.toHaveBeenCalled();
  });

  it("creates a verified mapping without persisting the raw subject", async () => {
    const { service, transaction } = setup();
    transaction.affiliateExternalIdentity.findUnique.mockResolvedValue(null);
    transaction.affiliateExternalIdentity.create.mockResolvedValue(identity);

    await expect(
      service.linkVerifiedSubject(identity.affiliateId, "Raw-Subject"),
    ).resolves.toMatchObject({
      affiliateId: identity.affiliateId,
      issuer,
    });
    expect(transaction.affiliateExternalIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affiliateId: identity.affiliateId,
          issuer,
          subjectRefHash: "opaque-hmac",
        }),
      }),
    );
    expect(
      transaction.affiliateExternalIdentity.create.mock.calls[0][0].data,
    ).not.toHaveProperty("subjectRef");
  });

  it("is idempotent for the same mapping and refreshes only its verification timestamp", async () => {
    const { service, transaction } = setup();
    transaction.affiliateExternalIdentity.findUnique.mockResolvedValueOnce(
      identity,
    );
    transaction.affiliateExternalIdentity.update.mockResolvedValue(identity);

    await expect(
      service.linkVerifiedSubject(identity.affiliateId, "Raw-Subject"),
    ).resolves.toMatchObject({
      affiliateId: identity.affiliateId,
    });
    expect(transaction.affiliateExternalIdentity.create).not.toHaveBeenCalled();
    expect(transaction.affiliateExternalIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: identity.id },
        data: { lastVerifiedAt: expect.any(Date) },
      }),
    );
  });

  it("never silently remaps a subject to another affiliate", async () => {
    const { service, transaction } = setup();
    transaction.affiliateExternalIdentity.findUnique.mockResolvedValue({
      ...identity,
      affiliateId: "different-affiliate-id",
    });
    await expect(
      service.linkVerifiedSubject(identity.affiliateId, "Raw-Subject"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.affiliateExternalIdentity.create).not.toHaveBeenCalled();
  });
});
