import {
  hasIdentityAssurance,
  IDENTITY_ASSURANCE_LEVELS,
  resolveCanonicalIdentityLevel,
  type ResolvedIdentityContext,
} from "./identity-resolution.contract";

describe("identity resolution dependency contract", () => {
  it("keeps the canonical assurance order and never treats a weaker assertion as sufficient", () => {
    expect(IDENTITY_ASSURANCE_LEVELS).toEqual([
      "ANONYMOUS",
      "CLAIMED",
      "MATCHED",
      "VERIFIED",
      "AUTHENTICATED",
      "MFA_VERIFIED",
      "STEP_UP_VERIFIED",
    ]);
    expect(hasIdentityAssurance("MATCHED", "VERIFIED")).toBe(false);
    expect(hasIdentityAssurance("AUTHENTICATED", "VERIFIED")).toBe(true);
    expect(hasIdentityAssurance("AUTHENTICATED", "MFA_VERIFIED")).toBe(false);
    expect(hasIdentityAssurance("AUTHENTICATED", "STEP_UP_VERIFIED")).toBe(false);
  });

  it("represents identity evidence without requiring unsafe contact or portal matching", () => {
    const identity: ResolvedIdentityContext = {
      version: "1.0.0",
      identityId: "identity-1",
      channelIdentities: [{ channel: "WEB", externalIdentityId: "web-session-1", verified: false }],
      assuranceLevel: "ANONYMOUS",
      authenticationEvidence: {
        authenticated: false,
        mfaVerified: false,
        stepUpVerified: false,
      },
      consentState: { status: "UNKNOWN", purposeKeys: [] },
      verifiedAttributes: [],
    };

    expect(identity.contactId).toBeUndefined();
    expect(identity.portalUserId).toBeUndefined();
    expect(identity.channelIdentities[0]?.verified).toBe(false);
    expect(resolveCanonicalIdentityLevel(identity)).toBeNull();
  });

  it("maps only explicit authenticated, MFA and step-up evidence", () => {
    const base: ResolvedIdentityContext = {
      version: "1.0.0",
      identityId: "identity-1",
      channelIdentities: [],
      assuranceLevel: "VERIFIED",
      authenticationEvidence: {
        authenticated: true,
        mfaVerified: true,
        stepUpVerified: true,
      },
      consentState: { status: "GRANTED", purposeKeys: ["support"] },
      verifiedAttributes: [],
    };
    expect(resolveCanonicalIdentityLevel(base)).toBeNull();
    expect(
      resolveCanonicalIdentityLevel({
        ...base,
        assuranceLevel: "MFA_VERIFIED",
        authenticationEvidence: {
          authenticated: true,
          mfaVerified: true,
          stepUpVerified: false,
        },
      }),
    ).toBe("MFA_VERIFIED");
    expect(
      resolveCanonicalIdentityLevel({
        ...base,
        assuranceLevel: "AUTHENTICATED",
      }),
    ).toBe("AUTHENTICATED");
    expect(
      resolveCanonicalIdentityLevel({
        ...base,
        assuranceLevel: "STEP_UP_VERIFIED",
        authenticationEvidence: {
          authenticated: true,
          mfaVerified: true,
          stepUpVerified: false,
        },
      }),
    ).toBeNull();
    expect(
      resolveCanonicalIdentityLevel({
        ...base,
        assuranceLevel: "STEP_UP_VERIFIED",
      }),
    ).toBe("STEP_UP_VERIFIED");
  });
});
