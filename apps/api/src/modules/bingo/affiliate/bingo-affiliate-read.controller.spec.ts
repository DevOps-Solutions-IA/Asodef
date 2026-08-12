import { ForbiddenException } from "@nestjs/common";
import { SelfServicePortal } from "@prisma/client";
import { BingoAffiliateReadController } from "./bingo-affiliate-read.controller";

describe("BingoAffiliateReadController", () => {
  const reads = { listMyEvents: jest.fn() };
  const identities = {
    resolveSubject: jest.fn().mockResolvedValue({
      identityId: "identity-id",
      affiliateId: "affiliate-id",
      issuer: "urn:asodef:core",
    }),
  };
  const controller = new BingoAffiliateReadController(
    reads as never,
    identities as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("resolves the opaque session subject through the identity bridge", async () => {
    reads.listMyEvents.mockResolvedValue([]);
    await controller.listEvents({
      selfService: {
        sessionId: "session-id",
        portal: SelfServicePortal.AFFILIATE,
        subjectRef: "opaque-provider-subject",
        scopes: ["affiliate:bingo:read"],
        assurance: "OTP",
        csrfTokenHash: "hash",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    } as never);

    expect(identities.resolveSubject).toHaveBeenCalledWith(
      "opaque-provider-subject",
    );
    expect(reads.listMyEvents).toHaveBeenCalledWith({
      sessionId: "session-id",
      affiliateId: "affiliate-id",
      identityId: "identity-id",
      identityIssuer: "urn:asodef:core",
      assurance: "OTP",
      scope: "affiliate:bingo:read",
    });
    expect(reads.listMyEvents.mock.calls[0]?.[0]).not.toHaveProperty(
      "subjectRef",
    );
  });

  it("rejects sessions without an affiliate read scope before identity resolution", async () => {
    await expect(
      controller.listEvents({
        selfService: {
          sessionId: "session-id",
          portal: SelfServicePortal.AFFILIATE,
          subjectRef: "opaque",
          scopes: [],
          assurance: "OTP",
          csrfTokenHash: "hash",
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        },
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(identities.resolveSubject).not.toHaveBeenCalled();
  });
});
