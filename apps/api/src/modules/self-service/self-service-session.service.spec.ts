import { SelfServicePortal } from "@prisma/client";
import { SelfServiceCookieService, SelfServiceSessionService } from "./self-service-session.service";

describe("self-service session security", () => {
  it("stores only opaque token/CSRF hashes and encrypted external references", async () => {
    const create = jest.fn(async ({ data }) => ({ id: "session-id", ...data }));
    const service = new SelfServiceSessionService({ selfServiceSession: { create } } as never, {
      generateToken: jest.fn().mockReturnValueOnce("raw-session-token").mockReturnValueOnce("raw-csrf-token"),
      hash: (value: string) => value === "raw-session-token" ? "opaque-session-hash" : "opaque-csrf-hash",
      encrypt: (value: string) => `encrypted:${value}`,
      fingerprint: (value: string) => `fp:${value}`,
    } as never, { get: () => 30 } as never);
    const result = await service.create("00000000-0000-4000-8000-000000000000", SelfServicePortal.AFFILIATE, "external-reference", { ipAddress: "127.0.0.1", userAgent: "test" });
    expect(result.rawToken).toBe("raw-session-token");
    const persisted = create.mock.calls[0]?.[0].data;
    expect(persisted).toMatchObject({ tokenHash: "opaque-session-hash", csrfTokenHash: "opaque-csrf-hash", subjectRefEncrypted: "encrypted:external-reference", assurance: "OTP", scopes: expect.arrayContaining(["affiliate:contact:manage", "affiliate:profile:update"]) });
    expect(persisted.scopes).not.toContain("payments:reverse");
    expect(JSON.stringify(persisted)).not.toContain("raw-session-token");
    expect(JSON.stringify(persisted)).not.toContain("raw-csrf-token");
  });

  it("sets portal-specific HttpOnly Strict cookies and Secure in production", () => {
    const cookie = jest.fn();
    const service = new SelfServiceCookieService({ get: () => "production" } as never);
    service.set({ cookie } as never, SelfServicePortal.AFFILIATE, "affiliate-opaque", new Date("2026-08-07T00:00:00Z"));
    service.set({ cookie } as never, SelfServicePortal.COMPANY, "company-opaque", new Date("2026-08-07T00:00:00Z"));
    expect(cookie).toHaveBeenCalledWith("asodef_affiliate_ss", "affiliate-opaque", expect.objectContaining({ httpOnly: true, sameSite: "strict", secure: true, path: "/api/v1/self-service" }));
    expect(cookie).toHaveBeenCalledWith("asodef_company_ss", "company-opaque", expect.objectContaining({ httpOnly: true, sameSite: "strict", secure: true, path: "/api/v1/self-service" }));
  });

  it("rejects a stolen opaque session token from a different browser binding", async () => {
    const session = {
      id: "session-id", portal: SelfServicePortal.AFFILIATE, subjectRefEncrypted: "encrypted-subject",
      tokenHash: "token-hash", csrfTokenHash: "csrf-hash", scopes: [], assurance: "OTP",
      ipHash: "fp:127.0.0.1", userAgentHash: "fp:expected-agent", expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
    };
    const update = jest.fn();
    const service = new SelfServiceSessionService({ selfServiceSession: { findUnique: jest.fn(async () => session), update } } as never, {
      hash: () => "token-hash", fingerprint: (value: string) => `fp:${value}`, decrypt: () => "subject",
    } as never, { get: () => 30 } as never);
    await expect(service.resolve("opaque", { ipAddress: "127.0.0.1", userAgent: "different-agent" })).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
