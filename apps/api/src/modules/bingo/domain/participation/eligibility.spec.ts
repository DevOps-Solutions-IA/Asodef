import {
  CustomApproval,
  EligibilityContext,
  EligibilityPolicy,
  evaluateEligibility,
} from "./eligibility";
import {
  IdentityResolution,
  validateIdentityResolution,
} from "./identity-resolution";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const EVENT_ID = "event-1";

function authorization(
  overrides: Partial<{
    eventId: string;
    source: string;
    referenceHash: string;
    authorizedAt: Date;
    expiresAt: Date;
    revokedAt: Date;
  }> = {},
) {
  return {
    eventId: EVENT_ID,
    source: "official-provider",
    referenceHash: "reference-hash",
    authorizedAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

const identities: Record<IdentityResolution["kind"], IdentityResolution> = {
  AFFILIATE: {
    kind: "AFFILIATE",
    subjectKey: "affiliate:a1",
    affiliateId: "a1",
    affiliateStatus: "ACTIVE",
  },
  BENEFICIARY: {
    kind: "BENEFICIARY",
    subjectKey: "beneficiary:b1",
    provider: "official-beneficiary-provider",
    ownerAffiliateId: "a1",
    authorization: authorization(),
  },
  PARTNER_COMPANY_MEMBER: {
    kind: "PARTNER_COMPANY_MEMBER",
    subjectKey: "company-member:m1",
    companyId: "company-1",
    authorization: authorization(),
  },
  AUTHORIZED_GUEST: {
    kind: "AUTHORIZED_GUEST",
    subjectKey: "guest:g1",
    authorization: authorization(),
  },
};

function approval(identity: IdentityResolution): CustomApproval {
  return {
    eventId: EVENT_ID,
    subjectKey: identity.subjectKey,
    source: "custom-approval-workflow",
    actorUserId: "supervisor-1",
    referenceHash: "approval-hash",
    approvedAt: new Date("2026-08-08T00:00:00.000Z"),
    context: { rule: "corporate-approved-v1" },
  };
}

function context(
  policy: EligibilityPolicy,
  identity: IdentityResolution,
  overrides: Partial<EligibilityContext> = {},
): EligibilityContext {
  return {
    eventId: EVENT_ID,
    policy,
    identity,
    allowedPartnerCompanyIds: ["company-1"],
    customApproval:
      policy === "CUSTOM_APPROVED" ? approval(identity) : undefined,
    combinedRules:
      policy === "COMBINED"
        ? {
            frozenAt: new Date("2026-08-08T00:00:00.000Z"),
            rules: [
              { kind: "ACTIVE_AFFILIATE" },
              { kind: "BENEFICIARY" },
              {
                kind: "PARTNER_COMPANY_MEMBER",
                allowedCompanyIds: ["company-1"],
              },
              { kind: "AUTHORIZED_GUEST" },
            ],
          }
        : undefined,
    now: NOW,
    ...overrides,
  };
}

describe("Bingo participation eligibility", () => {
  it.each([
    ["AFFILIATES", "AFFILIATE", true],
    ["AFFILIATES", "BENEFICIARY", false],
    ["AFFILIATES", "PARTNER_COMPANY_MEMBER", false],
    ["AFFILIATES", "AUTHORIZED_GUEST", false],
    ["AFFILIATES_AND_BENEFICIARIES", "AFFILIATE", true],
    ["AFFILIATES_AND_BENEFICIARIES", "BENEFICIARY", true],
    ["AFFILIATES_AND_BENEFICIARIES", "PARTNER_COMPANY_MEMBER", false],
    ["AFFILIATES_AND_BENEFICIARIES", "AUTHORIZED_GUEST", false],
    ["PARTNER_COMPANY", "AFFILIATE", false],
    ["PARTNER_COMPANY", "BENEFICIARY", false],
    ["PARTNER_COMPANY", "PARTNER_COMPANY_MEMBER", true],
    ["PARTNER_COMPANY", "AUTHORIZED_GUEST", false],
    ["AUTHORIZED_GUESTS", "AFFILIATE", false],
    ["AUTHORIZED_GUESTS", "BENEFICIARY", false],
    ["AUTHORIZED_GUESTS", "PARTNER_COMPANY_MEMBER", false],
    ["AUTHORIZED_GUESTS", "AUTHORIZED_GUEST", true],
    ["COMBINED", "AFFILIATE", true],
    ["COMBINED", "BENEFICIARY", true],
    ["COMBINED", "PARTNER_COMPANY_MEMBER", true],
    ["COMBINED", "AUTHORIZED_GUEST", true],
    ["CUSTOM_APPROVED", "AFFILIATE", true],
    ["CUSTOM_APPROVED", "BENEFICIARY", true],
    ["CUSTOM_APPROVED", "PARTNER_COMPANY_MEMBER", true],
    ["CUSTOM_APPROVED", "AUTHORIZED_GUEST", true],
  ] as const)("applies %s to %s", (policy, kind, expected) => {
    expect(
      evaluateEligibility(context(policy, identities[kind])).eligible,
    ).toBe(expected);
  });

  it("requires an explicitly active affiliate", () => {
    expect(
      evaluateEligibility(
        context("AFFILIATES", {
          ...identities.AFFILIATE,
          affiliateStatus: "SUSPENDED",
        } as IdentityResolution),
      ),
    ).toMatchObject({
      eligible: false,
      code: "IDENTITY_INVALID",
      identityCode: "AFFILIATE_NOT_ACTIVE",
    });
    expect(
      validateIdentityResolution({
        identity: {
          ...identities.AFFILIATE,
          affiliateId: "",
        } as IdentityResolution,
        eventId: EVENT_ID,
        now: NOW,
      }),
    ).toEqual({ valid: false, code: "INVALID_AFFILIATE" });
  });

  it("evaluates only the frozen physical rules enabled by COMBINED", () => {
    const affiliateOnly = {
      frozenAt: new Date("2026-08-08T00:00:00.000Z"),
      rules: [{ kind: "ACTIVE_AFFILIATE" as const }],
    };
    expect(
      evaluateEligibility(
        context("COMBINED", identities.AFFILIATE, {
          combinedRules: affiliateOnly,
        }),
      ),
    ).toMatchObject({ eligible: true, code: "ELIGIBLE" });
    expect(
      evaluateEligibility(
        context("COMBINED", identities.AUTHORIZED_GUEST, {
          combinedRules: affiliateOnly,
        }),
      ),
    ).toMatchObject({
      eligible: false,
      code: "POLICY_DOES_NOT_ALLOW_SUBJECT",
    });
  });

  it("uses CUSTOM_APPROVED in COMBINED only when that frozen rule is present", () => {
    const combinedRules = {
      frozenAt: new Date("2026-08-08T00:00:00.000Z"),
      rules: [{ kind: "CUSTOM_APPROVED" as const }],
    };
    expect(
      evaluateEligibility(
        context("COMBINED", identities.AUTHORIZED_GUEST, {
          combinedRules,
          customApproval: approval(identities.AUTHORIZED_GUEST),
        }),
      ),
    ).toMatchObject({ eligible: true, code: "ELIGIBLE" });
    expect(
      evaluateEligibility(
        context("COMBINED", identities.AUTHORIZED_GUEST, {
          combinedRules,
          customApproval: undefined,
        }),
      ),
    ).toMatchObject({ eligible: false, code: "CUSTOM_APPROVAL_REQUIRED" });
  });

  it.each([
    [undefined, "COMBINED_RULES_REQUIRED"],
    [
      { frozenAt: new Date("2026-08-08T00:00:00.000Z"), rules: [] },
      "COMBINED_RULES_INVALID",
    ],
    [
      {
        frozenAt: new Date("2026-08-08T00:00:00.000Z"),
        rules: [{ kind: "PARTNER_COMPANY_MEMBER", allowedCompanyIds: [] }],
      },
      "COMBINED_RULES_INVALID",
    ],
  ] as const)(
    "fails closed for malformed COMBINED snapshot %#",
    (combinedRules, code) => {
      expect(
        evaluateEligibility(
          context("COMBINED", identities.AFFILIATE, {
            combinedRules,
          }),
        ),
      ).toMatchObject({ eligible: false, code });
    },
  );

  it.each([
    [{ eventId: "other" }, "AUTHORIZATION_EVENT_MISMATCH"],
    [
      { authorizedAt: new Date("2026-08-10T00:00:00.000Z") },
      "AUTHORIZATION_NOT_YET_VALID",
    ],
    [{ expiresAt: NOW }, "AUTHORIZATION_EXPIRED"],
    [
      { revokedAt: new Date("2026-08-08T00:00:00.000Z") },
      "AUTHORIZATION_REVOKED",
    ],
    [{ authorizedAt: new Date(Number.NaN) }, "AUTHORIZATION_DATE_INVALID"],
    [{ expiresAt: new Date(Number.NaN) }, "AUTHORIZATION_DATE_INVALID"],
    [{ revokedAt: new Date(Number.NaN) }, "AUTHORIZATION_DATE_INVALID"],
    [
      { expiresAt: new Date("2026-07-31T00:00:00.000Z") },
      "AUTHORIZATION_TEMPORAL_ORDER_INVALID",
    ],
    [
      { revokedAt: new Date("2026-07-31T00:00:00.000Z") },
      "AUTHORIZATION_TEMPORAL_ORDER_INVALID",
    ],
  ] as const)("rejects mutated external authorization %#", (mutation, code) => {
    const identity: IdentityResolution = {
      ...identities.AUTHORIZED_GUEST,
      authorization: authorization(mutation),
    } as IdentityResolution;
    expect(
      validateIdentityResolution({ identity, eventId: EVENT_ID, now: NOW }),
    ).toEqual({
      valid: false,
      code,
    });
  });

  it("rejects a non-finite identity reference time", () => {
    expect(
      validateIdentityResolution({
        identity: identities.AFFILIATE,
        eventId: EVENT_ID,
        now: new Date(Number.NaN),
      }),
    ).toEqual({ valid: false, code: "INVALID_REFERENCE_TIME" });
  });

  it("requires the partner company to be allowed by the event", () => {
    expect(
      evaluateEligibility(
        context("PARTNER_COMPANY", identities.PARTNER_COMPANY_MEMBER, {
          allowedPartnerCompanyIds: ["another-company"],
        }),
      ),
    ).toMatchObject({ eligible: false, code: "PARTNER_COMPANY_NOT_ALLOWED" });
  });

  it.each([
    [undefined, "CUSTOM_APPROVAL_REQUIRED"],
    [
      { ...approval(identities.AFFILIATE), eventId: "other" },
      "CUSTOM_APPROVAL_SCOPE_MISMATCH",
    ],
    [
      { ...approval(identities.AFFILIATE), actorUserId: "" },
      "CUSTOM_APPROVAL_EVIDENCE_INVALID",
    ],
    [
      { ...approval(identities.AFFILIATE), revokedAt: NOW },
      "CUSTOM_APPROVAL_REVOKED",
    ],
    [
      {
        ...approval(identities.AFFILIATE),
        approvedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
      "CUSTOM_APPROVAL_NOT_YET_VALID",
    ],
    [
      {
        ...approval(identities.AFFILIATE),
        approvedAt: new Date(Number.NaN),
      },
      "CUSTOM_APPROVAL_DATE_INVALID",
    ],
    [
      {
        ...approval(identities.AFFILIATE),
        revokedAt: new Date(Number.NaN),
      },
      "CUSTOM_APPROVAL_DATE_INVALID",
    ],
    [
      {
        ...approval(identities.AFFILIATE),
        revokedAt: new Date("2026-08-07T00:00:00.000Z"),
      },
      "CUSTOM_APPROVAL_TEMPORAL_ORDER_INVALID",
    ],
  ] as const)("rejects invalid custom approval %#", (customApproval, code) => {
    expect(
      evaluateEligibility(
        context("CUSTOM_APPROVED", identities.AFFILIATE, { customApproval }),
      ),
    ).toMatchObject({ eligible: false, code });
  });

  it("rejects custom approval created after eligibility or operation freeze", () => {
    const customApproval = {
      ...approval(identities.AFFILIATE),
      approvedAt: new Date("2026-08-08T12:00:00.000Z"),
    };
    expect(
      evaluateEligibility(
        context("CUSTOM_APPROVED", identities.AFFILIATE, {
          customApproval,
          eligibilityFrozenAt: new Date("2026-08-08T10:00:00.000Z"),
        }),
      ),
    ).toMatchObject({ eligible: false, code: "CUSTOM_APPROVAL_AFTER_FREEZE" });
  });

  it.each([
    [{ eligibilityFrozenAt: new Date(Number.NaN) }, "ELIGIBILITY_DATE_INVALID"],
    [{ operationStartedAt: new Date(Number.NaN) }, "ELIGIBILITY_DATE_INVALID"],
    [
      { eligibilityFrozenAt: new Date("2026-08-10T00:00:00.000Z") },
      "ELIGIBILITY_TEMPORAL_ORDER_INVALID",
    ],
    [
      {
        eligibilityFrozenAt: new Date("2026-08-08T12:00:00.000Z"),
        operationStartedAt: new Date("2026-08-08T10:00:00.000Z"),
      },
      "ELIGIBILITY_TEMPORAL_ORDER_INVALID",
    ],
  ] as const)(
    "fails closed for malformed eligibility timeline %#",
    (mutation, code) => {
      expect(
        evaluateEligibility(
          context("AFFILIATES", identities.AFFILIATE, mutation),
        ),
      ).toMatchObject({ eligible: false, code });
    },
  );

  it("fails closed across a deterministic Invalid Date mutation matrix", () => {
    const invalid = () => new Date(Number.NaN);
    const mutations: readonly Partial<EligibilityContext>[] = [
      { now: invalid() },
      { eligibilityFrozenAt: invalid() },
      { operationStartedAt: invalid() },
      {
        combinedRules: {
          frozenAt: invalid(),
          rules: [{ kind: "ACTIVE_AFFILIATE" }],
        },
      },
    ];
    for (const mutation of mutations) {
      const first = evaluateEligibility(
        context(
          mutation.combinedRules === undefined ? "AFFILIATES" : "COMBINED",
          identities.AFFILIATE,
          mutation,
        ),
      );
      expect(first.eligible).toBe(false);
      expect(
        evaluateEligibility(
          context(
            mutation.combinedRules === undefined ? "AFFILIATES" : "COMBINED",
            identities.AFFILIATE,
            mutation,
          ),
        ),
      ).toEqual(first);
    }
  });

  it("is deterministic across a seeded mutation fuzz matrix", () => {
    let seed = 0x5f3759df;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const policies: EligibilityPolicy[] = [
      "AFFILIATES",
      "AFFILIATES_AND_BENEFICIARIES",
      "PARTNER_COMPANY",
      "AUTHORIZED_GUESTS",
      "COMBINED",
      "CUSTOM_APPROVED",
    ];
    const kinds = Object.keys(identities) as IdentityResolution["kind"][];
    for (let index = 0; index < 1_000; index += 1) {
      const policy = policies[next() % policies.length]!;
      const identity = identities[kinds[next() % kinds.length]!];
      const first = evaluateEligibility(context(policy, identity));
      const second = evaluateEligibility(context(policy, identity));
      expect(second).toEqual(first);
      if (first.eligible) {
        expect(first.code).toBe("ELIGIBLE");
        expect(first.eventId).toBe(EVENT_ID);
        expect(first.subjectKey).toBe(identity.subjectKey);
      }
    }
  });
});
