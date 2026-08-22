import {
  hasIdentityAssurance,
  IDENTITY_ASSURANCE_LEVELS,
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
      "STEP_UP_VERIFIED",
    ]);
    expect(hasIdentityAssurance("MATCHED", "VERIFIED")).toBe(false);
    expect(hasIdentityAssurance("AUTHENTICATED", "VERIFIED")).toBe(true);
    expect(hasIdentityAssurance("AUTHENTICATED", "STEP_UP_VERIFIED")).toBe(false);
  });

  it("represents identity evidence without requiring unsafe contact or portal matching", () => {
    const identity: ResolvedIdentityContext = {
      version: "1.0.0",
      identityId: "identity-1",
      channelIdentities: [{ channel: "WEB", externalIdentityId: "web-session-1", verified: false }],
      assuranceLevel: "ANONYMOUS",
      consentState: { status: "UNKNOWN", purposeKeys: [] },
      verifiedAttributes: [],
    };

    expect(identity.contactId).toBeUndefined();
    expect(identity.portalUserId).toBeUndefined();
    expect(identity.channelIdentities[0]?.verified).toBe(false);
  });
});
