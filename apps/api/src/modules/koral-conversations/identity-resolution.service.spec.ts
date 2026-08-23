import { ConversationChannel } from "@prisma/client";
import { KoralIdentityResolutionService } from "./identity-resolution.service";

describe("KoralIdentityResolutionService", () => {
  const userFindFirst = jest.fn();
  const findStepUpState = jest.fn();
  const service = new KoralIdentityResolutionService(
    { user: { findFirst: userFindFirst } } as never,
    { findStepUpState } as never,
    { get: () => 300 } as never,
  );
  const channel = { channel: ConversationChannel.WEB, externalIdentityId: "visitor-1" };

  beforeEach(() => jest.clearAllMocks());

  it("resolves progressive non-authenticated evidence without manufacturing authentication", () => {
    const anonymous = service.resolveAnonymous(channel);
    const claimed = service.resolveClaimed({ ...channel, claimedIdentityId: "identity-1", evidenceReference: "claim:form-1" });
    const verified = service.resolveVerified({
      ...channel,
      identityId: "identity-1",
      evidenceReference: "verification:email-1",
      verifiedAttributes: [{ name: "email", source: "email-challenge", verifiedAt: "2026-08-22T12:00:00.000Z" }],
    });

    expect(anonymous.identity.assuranceLevel).toBe("ANONYMOUS");
    expect(anonymous.identity.identityId).not.toContain("visitor-1");
    expect(claimed.identity.assuranceLevel).toBe("CLAIMED");
    expect(verified.identity.assuranceLevel).toBe("VERIFIED");
    for (const resolved of [anonymous, claimed, verified]) {
      expect(resolved.identity.authenticationEvidence).toEqual({ authenticated: false, mfaVerified: false, stepUpVerified: false });
    }
  });

  it("fails closed for ambiguous matches or absent verification evidence", () => {
    expect(() => service.resolveMatched({ ...channel, candidateIdentityIds: ["one", "two"], evidenceReference: "match:1" })).toThrow("AMBIGUOUS_IDENTITY");
    expect(() => service.resolveVerified({ ...channel, identityId: "one", evidenceReference: "verify:1", verifiedAttributes: [] })).toThrow("VERIFIED_ATTRIBUTE_REQUIRED");
  });

  it("derives authenticated, MFA and step-up assurance only from a live server session", async () => {
    userFindFirst.mockResolvedValue({ id: "user-1" });
    const now = new Date("2026-08-22T12:00:00.000Z");

    findStepUpState.mockResolvedValueOnce({ mfaVerifiedAt: null, recentAuthenticationAt: null });
    await expect(service.resolveAuthenticated({ ...channel, userId: "user-1", sessionId: "session-1" }, now))
      .resolves.toMatchObject({ identity: { assuranceLevel: "AUTHENTICATED" } });

    findStepUpState.mockResolvedValueOnce({ mfaVerifiedAt: new Date("2026-08-22T10:00:00.000Z"), recentAuthenticationAt: null });
    await expect(service.resolveAuthenticated({ ...channel, userId: "user-1", sessionId: "session-2" }, now))
      .resolves.toMatchObject({ identity: { assuranceLevel: "MFA_VERIFIED" } });

    findStepUpState.mockResolvedValueOnce({ mfaVerifiedAt: new Date("2026-08-22T11:59:00.000Z"), recentAuthenticationAt: new Date("2026-08-22T11:59:00.000Z") });
    await expect(service.resolveAuthenticated({ ...channel, userId: "user-1", sessionId: "session-3" }, now))
      .resolves.toMatchObject({ identity: { assuranceLevel: "STEP_UP_VERIFIED" } });
  });

  it("rejects inactive identities and unusable sessions", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    await expect(service.resolveAuthenticated({ ...channel, userId: "user-1", sessionId: "session-1" })).rejects.toThrow("AUTHENTICATED_IDENTITY_UNAVAILABLE");
    userFindFirst.mockResolvedValueOnce({ id: "user-1" });
    findStepUpState.mockResolvedValueOnce(null);
    await expect(service.resolveAuthenticated({ ...channel, userId: "user-1", sessionId: "session-1" })).rejects.toThrow("AUTHENTICATION_EVIDENCE_INVALID");
  });
});
