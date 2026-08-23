import {
  DataClassificationPolicy,
  type DataClassificationPolicyContract,
} from "./data-classification";

const policy: DataClassificationPolicyContract = {
  allowed: ["PUBLIC", "INTERNAL", "PERSONAL", "SENSITIVE"],
  denied: ["HIGHLY_SENSITIVE"],
  requirePurpose: true,
  requireConsentFor: ["PERSONAL"],
  maximumExternalClassification: "PERSONAL",
};

describe("DataClassificationPolicy", () => {
  const gate = new DataClassificationPolicy();

  it("allows explicitly permitted data with purpose and required consent", () => {
    expect(
      gate.evaluate("PERSONAL", policy, {
        purpose: "crm-assistance",
        consentVerified: true,
        externalProvider: true,
      }),
    ).toEqual({
      allowed: true,
      reason: "ALLOWED",
    });
  });

  it.each([
    ["PERSONAL", false, true, "CONSENT_REQUIRED"],
    ["SENSITIVE", true, true, "EXTERNAL_PROVIDER_LIMIT_EXCEEDED"],
    ["HIGHLY_SENSITIVE", true, true, "CLASSIFICATION_EXPLICITLY_DENIED"],
  ] as const)(
    "fails closed for %s",
    (classification, consentVerified, externalProvider, reason) => {
      expect(
        gate.evaluate(classification, policy, {
          purpose: "test",
          consentVerified,
          externalProvider,
        }),
      ).toEqual({
        allowed: false,
        reason,
      });
    },
  );
});
