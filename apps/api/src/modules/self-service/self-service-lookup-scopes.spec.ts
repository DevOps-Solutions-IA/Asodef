import { SelfServicePortal } from "@prisma/client";
import { SelfServiceSessionService } from "./self-service-session.service";

function serviceFor(create: jest.Mock) {
  return new SelfServiceSessionService(
    { selfServiceSession: { create } } as never,
    {
      generateToken: jest.fn().mockReturnValueOnce("lookup-session-token").mockReturnValueOnce("lookup-csrf-token"),
      hash: (value: string) => `hash:${value}`,
      encrypt: (value: string) => `encrypted:${value}`,
      fingerprint: (value: string) => `fp:${value}`,
    } as never,
    { get: () => 30 } as never,
  );
}

describe("self-service LOOKUP scopes", () => {
  it("keeps normal affiliate operations available while OTP-only sensitive actions stay blocked", async () => {
    const create = jest.fn(async ({ data }) => ({ id: "lookup-session", ...data }));
    const service = serviceFor(create);

    const result = await service.createLookup(
      "00000000-0000-4000-8000-000000000000",
      SelfServicePortal.AFFILIATE,
      "123456789",
      { ipAddress: "127.0.0.1", userAgent: "browser" },
    );

    expect(result.assurance).toBe("LOOKUP");
    expect(result.scopes).toEqual(expect.arrayContaining([
      "affiliate:contact:manage",
      "affiliate:profile:update",
      "payments:quote",
      "payments:apply",
    ]));
    expect(result.scopes).not.toContain("affiliate:beneficiaries:manage");
    expect(result.scopes).not.toContain("affiliate:documents:upload");
    expect(result.scopes).not.toContain("payments:reverse");
  });

  it("keeps company payment quote/apply available without granting reversal", async () => {
    const create = jest.fn(async ({ data }) => ({ id: "lookup-session", ...data }));
    const service = serviceFor(create);

    const result = await service.createLookup(
      "00000000-0000-4000-8000-000000000000",
      SelfServicePortal.COMPANY,
      "900123456",
      { ipAddress: "127.0.0.1", userAgent: "browser" },
    );

    expect(result.assurance).toBe("LOOKUP");
    expect(result.scopes).toEqual(expect.arrayContaining(["payments:quote", "payments:apply"]));
    expect(result.scopes).not.toContain("payments:reverse");
  });
});
