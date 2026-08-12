import { BINGO_AFFILIATE_ROUTE_CONTRACTS, type BingoAffiliateActorContract } from "./affiliate-contract";

describe("Bingo affiliate contracts", () => {
  it("binds reads to a resolved Affiliate.id application context", () => {
    const actor: BingoAffiliateActorContract = {
      sessionId: "session-1",
      affiliateId: "affiliate-uuid",
      identityId: "identity-uuid",
      identityIssuer: "asodef-core",
      assurance: "OTP",
      scope: "affiliate:bingo:read",
    };
    expect(actor.affiliateId).toBe("affiliate-uuid");
    expect(actor).not.toHaveProperty("subjectRef");
  });

  it("does not declare document, phone or affiliate-code lookup routes", () => {
    const serialized = JSON.stringify(BINGO_AFFILIATE_ROUTE_CONTRACTS).toLowerCase();
    expect(serialized).not.toMatch(/document|phone|telefono|affiliatecode|codigo/);
    expect(BINGO_AFFILIATE_ROUTE_CONTRACTS.every(({ scope }) => scope === "affiliate:bingo:read")).toBe(true);
  });
});

