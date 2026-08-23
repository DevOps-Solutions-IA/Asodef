import {
  ModelProfileLifecyclePolicy,
  ModelRegistry,
  type ModelProfile,
} from "./model-registry";

export const publishedProfile: ModelProfile = {
  id: "koral-crm",
  name: "Koral CRM assistant",
  primaryModel: "vendor/model-primary",
  fallbackModels: ["vendor/model-fallback"],
  allowedProviders: ["openrouter"],
  purpose: "crm-assistance",
  maxInputTokens: 8_000,
  maxOutputTokens: 1_000,
  budgetPolicy: {
    currency: "USD",
    maxCostMicrosPerRequest: 20_000,
    maxCostMicrosPerDay: 1_000_000,
    failClosedWhenPricingUnknown: true,
  },
  toolCallingAllowed: true,
  structuredOutputRequired: true,
  dataClassificationPolicy: {
    allowed: ["PUBLIC", "INTERNAL", "PERSONAL"],
    denied: ["SENSITIVE", "HIGHLY_SENSITIVE"],
    requirePurpose: true,
    requireConsentFor: ["PERSONAL"],
    maximumExternalClassification: "PERSONAL",
  },
  enabled: true,
  policyApproved: true,
  status: "PUBLISHED",
  version: 1,
};

describe("ModelRegistry", () => {
  it("resolves only the latest published version", () => {
    const registry = new ModelRegistry([
      { ...publishedProfile, status: "RETIRED" },
      { ...publishedProfile, version: 2, primaryModel: "vendor/model-v2" },
      {
        ...publishedProfile,
        version: 3,
        status: "REVIEW",
        primaryModel: "vendor/model-v3",
      },
    ]);
    expect(registry.getPublished("koral-crm")).toMatchObject({
      version: 2,
      primaryModel: "vendor/model-v2",
    });
  });

  it("rejects duplicate profile versions and unavailable runtime lookups", () => {
    expect(
      () => new ModelRegistry([publishedProfile, publishedProfile]),
    ).toThrow("DUPLICATE_MODEL_PROFILE");
    expect(() =>
      new ModelRegistry([
        { ...publishedProfile, status: "DRAFT" },
      ]).getPublished("koral-crm"),
    ).toThrow("MODEL_PROFILE_NOT_AVAILABLE");
    expect(() =>
      new ModelRegistry([{ ...publishedProfile, enabled: false }]).getPublished(
        "koral-crm",
      ),
    ).toThrow("MODEL_PROFILE_NOT_AVAILABLE");
    expect(() =>
      new ModelRegistry([
        { ...publishedProfile, policyApproved: false },
      ]).getPublished("koral-crm"),
    ).toThrow("MODEL_PROFILE_NOT_AVAILABLE");
  });

  it("enforces the review and publication lifecycle", () => {
    const lifecycle = new ModelProfileLifecyclePolicy();
    expect(() => lifecycle.assertTransition("DRAFT", "REVIEW")).not.toThrow();
    expect(() =>
      lifecycle.assertTransition("REVIEW", "PUBLISHED"),
    ).not.toThrow();
    expect(() => lifecycle.assertTransition("DRAFT", "PUBLISHED")).toThrow(
      "INVALID_MODEL_PROFILE_TRANSITION",
    );
  });
});
