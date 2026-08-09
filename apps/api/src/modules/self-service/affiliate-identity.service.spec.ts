import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AffiliateIdentityService } from "./affiliate-identity.service";

describe("AffiliateIdentityService", () => {
  function setup(provider: "http" | "not_configured" = "http") {
    const prisma = { $transaction: jest.fn() };
    const config = {
      get: jest.fn((key: string) => {
        if (key === "EXTERNAL_CORE_PROVIDER") return provider;
        if (key === "EXTERNAL_CORE_IDENTITY_ISSUER") return "https://identity.example.com";
        return undefined;
      }),
    };
    const fingerprints = {
      fingerprints: jest.fn(() => [
        { keyId: "v1", subjectRefHash: "a".repeat(64), active: true },
      ]),
    };
    return {
      service: new AffiliateIdentityService(prisma as never, config as never, fingerprints as never),
      prisma,
      fingerprints,
    };
  }

  it("fails closed before hashing when the trusted provider is unavailable", async () => {
    const { service, prisma, fingerprints } = setup("not_configured");
    await expect(service.resolveSubject("subject")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fingerprints.fingerprints).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "x".repeat(513)])("rejects invalid opaque subjects", async (subjectRef) => {
    const { service } = setup();
    await expect(service.resolveSubject(subjectRef)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
