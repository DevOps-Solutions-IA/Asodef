import { NotFoundException } from "@nestjs/common";
import { BingoAffiliateReadService } from "./bingo-affiliate-read.service";

describe("BingoAffiliateReadService isolation", () => {
  const prisma = {
    bingoEvent: { findFirst: jest.fn() },
    affiliate: { findUnique: jest.fn() },
    bingoParticipant: { findFirst: jest.fn() },
    bingoCardAssignment: { findFirst: jest.fn() },
  };
  const service = new BingoAffiliateReadService(prisma as never);
  const actor = {
    sessionId: "session",
    affiliateId: "affiliate-a",
    identityId: "identity",
    identityIssuer: "issuer",
    assurance: "OTP" as const,
    scope: "affiliate:bingo:read" as const,
  };

  beforeEach(() => jest.clearAllMocks());

  it("returns the same 404 when an event card belongs to another affiliate", async () => {
    prisma.bingoEvent.findFirst.mockResolvedValue({ visibility: "PUBLIC" });
    prisma.affiliate.findUnique.mockResolvedValue({ status: "ACTIVE" });
    prisma.bingoParticipant.findFirst.mockResolvedValue({ id: "participant-a" });
    prisma.bingoCardAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.getMyCard(actor, "event-id", "card-owned-by-b"),
    ).rejects.toEqual(new NotFoundException("Bingo no encontrado."));
    expect(prisma.bingoCardAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: "event-id",
          cardId: "card-owned-by-b",
          participant: { affiliateId: "affiliate-a" },
        }),
      }),
    );
  });

  it("does not grant authenticated visibility to an inactive affiliate", async () => {
    prisma.bingoEvent.findFirst.mockResolvedValue({
      visibility: "AUTHENTICATED_AFFILIATES",
    });
    prisma.affiliate.findUnique.mockResolvedValue({ status: "INACTIVE" });
    prisma.bingoParticipant.findFirst.mockResolvedValue(null);

    await expect(service.getRoundState(actor, "event-id")).rejects.toEqual(
      new NotFoundException("Bingo no encontrado."),
    );
  });
});
