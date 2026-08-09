import {
  IdentityResolution,
  validateIdentityResolution,
} from "./identity-resolution";

export type EligibilityPolicy =
  | "AFFILIATES"
  | "AFFILIATES_AND_BENEFICIARIES"
  | "PARTNER_COMPANY"
  | "AUTHORIZED_GUESTS"
  | "COMBINED"
  | "CUSTOM_APPROVED";

/** Mirrors the physical BingoEligibilityRuleKind enum. */
export type BingoEligibilityRuleKind =
  | "ACTIVE_AFFILIATE"
  | "BENEFICIARY"
  | "PARTNER_COMPANY_MEMBER"
  | "AUTHORIZED_GUEST"
  | "CUSTOM_APPROVED";

export type CombinedEligibilityRule =
  | Readonly<{ kind: "ACTIVE_AFFILIATE" }>
  | Readonly<{ kind: "BENEFICIARY" }>
  | Readonly<{
      kind: "PARTNER_COMPANY_MEMBER";
      allowedCompanyIds: readonly string[];
    }>
  | Readonly<{ kind: "AUTHORIZED_GUEST" }>
  | Readonly<{ kind: "CUSTOM_APPROVED" }>;

export type FrozenCombinedEligibilitySnapshot = Readonly<{
  frozenAt: Date;
  rules: readonly CombinedEligibilityRule[];
}>;

export type CustomApproval = Readonly<{
  eventId: string;
  subjectKey: string;
  source: string;
  actorUserId: string;
  referenceHash: string;
  approvedAt: Date;
  reason?: string;
  context: Readonly<Record<string, unknown>>;
  revokedAt?: Date;
}>;

export type EligibilityContext = Readonly<{
  eventId: string;
  policy: EligibilityPolicy;
  identity: IdentityResolution;
  allowedPartnerCompanyIds: readonly string[];
  customApproval?: CustomApproval;
  combinedRules?: FrozenCombinedEligibilitySnapshot;
  eligibilityFrozenAt?: Date;
  operationStartedAt?: Date;
  now: Date;
}>;

export type EligibilityDecisionCode =
  | "ELIGIBLE"
  | "IDENTITY_INVALID"
  | "POLICY_DOES_NOT_ALLOW_SUBJECT"
  | "PARTNER_COMPANY_NOT_ALLOWED"
  | "CUSTOM_APPROVAL_REQUIRED"
  | "CUSTOM_APPROVAL_SCOPE_MISMATCH"
  | "CUSTOM_APPROVAL_EVIDENCE_INVALID"
  | "CUSTOM_APPROVAL_REVOKED"
  | "CUSTOM_APPROVAL_NOT_YET_VALID"
  | "CUSTOM_APPROVAL_AFTER_FREEZE"
  | "CUSTOM_APPROVAL_DATE_INVALID"
  | "CUSTOM_APPROVAL_TEMPORAL_ORDER_INVALID"
  | "ELIGIBILITY_DATE_INVALID"
  | "ELIGIBILITY_TEMPORAL_ORDER_INVALID"
  | "COMBINED_RULES_REQUIRED"
  | "COMBINED_RULES_INVALID";

export type EligibilityDecision = Readonly<{
  eligible: boolean;
  code: EligibilityDecisionCode;
  identityCode: ReturnType<typeof validateIdentityResolution>["code"];
  eventId: string;
  subjectKey: string;
}>;

function decision(
  context: EligibilityContext,
  eligible: boolean,
  code: EligibilityDecisionCode,
  identityCode: EligibilityDecision["identityCode"],
): EligibilityDecision {
  return {
    eligible,
    code,
    identityCode,
    eventId: context.eventId,
    subjectKey: context.identity.subjectKey,
  };
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validatesCustomApproval(
  context: EligibilityContext,
): EligibilityDecision {
  const approval = context.customApproval;
  if (approval === undefined) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_REQUIRED",
      "IDENTITY_VALID",
    );
  }
  if (
    approval.eventId !== context.eventId ||
    approval.subjectKey !== context.identity.subjectKey
  ) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_SCOPE_MISMATCH",
      "IDENTITY_VALID",
    );
  }
  if (
    approval.source.trim() === "" ||
    approval.actorUserId.trim() === "" ||
    approval.referenceHash.trim() === "" ||
    approval.context === null ||
    Array.isArray(approval.context)
  ) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_EVIDENCE_INVALID",
      "IDENTITY_VALID",
    );
  }
  if (
    !validDate(approval.approvedAt) ||
    (approval.revokedAt !== undefined && !validDate(approval.revokedAt))
  ) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_DATE_INVALID",
      "IDENTITY_VALID",
    );
  }
  if (
    approval.revokedAt !== undefined &&
    (approval.revokedAt.getTime() < approval.approvedAt.getTime() ||
      approval.revokedAt.getTime() > context.now.getTime())
  ) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_TEMPORAL_ORDER_INVALID",
      "IDENTITY_VALID",
    );
  }
  if (approval.revokedAt !== undefined) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_REVOKED",
      "IDENTITY_VALID",
    );
  }
  if (approval.approvedAt.getTime() > context.now.getTime()) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_NOT_YET_VALID",
      "IDENTITY_VALID",
    );
  }
  const freezeTimes = [
    context.eligibilityFrozenAt?.getTime(),
    context.operationStartedAt?.getTime(),
  ].filter((value): value is number => value !== undefined);
  if (
    freezeTimes.length > 0 &&
    approval.approvedAt.getTime() > Math.min(...freezeTimes)
  ) {
    return decision(
      context,
      false,
      "CUSTOM_APPROVAL_AFTER_FREEZE",
      "IDENTITY_VALID",
    );
  }
  return decision(context, true, "ELIGIBLE", "IDENTITY_VALID");
}

function validateCombinedRules(context: EligibilityContext):
  | Readonly<{ valid: true; rules: readonly CombinedEligibilityRule[] }>
  | Readonly<{
      valid: false;
      code: "COMBINED_RULES_REQUIRED" | "COMBINED_RULES_INVALID";
    }> {
  const snapshot = context.combinedRules;
  if (snapshot === undefined || snapshot === null) {
    return { valid: false, code: "COMBINED_RULES_REQUIRED" };
  }
  if (
    !validDate(snapshot.frozenAt) ||
    snapshot.frozenAt.getTime() > context.now.getTime() ||
    !Array.isArray(snapshot.rules) ||
    snapshot.rules.length === 0
  ) {
    return { valid: false, code: "COMBINED_RULES_INVALID" };
  }
  const kinds = new Set<string>();
  for (const rule of snapshot.rules) {
    if (
      rule === null ||
      typeof rule !== "object" ||
      kinds.has((rule as CombinedEligibilityRule).kind)
    ) {
      return { valid: false, code: "COMBINED_RULES_INVALID" };
    }
    const kind = (rule as CombinedEligibilityRule).kind;
    kinds.add(kind);
    switch (kind) {
      case "ACTIVE_AFFILIATE":
      case "BENEFICIARY":
      case "AUTHORIZED_GUEST":
      case "CUSTOM_APPROVED":
        break;
      case "PARTNER_COMPANY_MEMBER": {
        const companyIds = (
          rule as Extract<
            CombinedEligibilityRule,
            { kind: "PARTNER_COMPANY_MEMBER" }
          >
        ).allowedCompanyIds;
        if (
          !Array.isArray(companyIds) ||
          companyIds.length === 0 ||
          companyIds.some((id) => typeof id !== "string" || id.trim() === "") ||
          new Set(companyIds).size !== companyIds.length
        ) {
          return { valid: false, code: "COMBINED_RULES_INVALID" };
        }
        break;
      }
      default:
        return { valid: false, code: "COMBINED_RULES_INVALID" };
    }
  }
  return { valid: true, rules: snapshot.rules };
}

export function evaluateEligibility(
  context: EligibilityContext,
): EligibilityDecision {
  const identity = validateIdentityResolution({
    identity: context.identity,
    eventId: context.eventId,
    now: context.now,
  });
  if (!identity.valid) {
    return decision(context, false, "IDENTITY_INVALID", identity.code);
  }

  const eligibilityDates = [
    context.eligibilityFrozenAt,
    context.operationStartedAt,
  ];
  if (
    eligibilityDates.some((value) => value !== undefined && !validDate(value))
  ) {
    return decision(context, false, "ELIGIBILITY_DATE_INVALID", identity.code);
  }
  if (
    eligibilityDates.some(
      (value) => value !== undefined && value.getTime() > context.now.getTime(),
    ) ||
    (context.eligibilityFrozenAt !== undefined &&
      context.operationStartedAt !== undefined &&
      context.operationStartedAt.getTime() <
        context.eligibilityFrozenAt.getTime())
  ) {
    return decision(
      context,
      false,
      "ELIGIBILITY_TEMPORAL_ORDER_INVALID",
      identity.code,
    );
  }

  if (context.policy === "CUSTOM_APPROVED") {
    return validatesCustomApproval(context);
  }

  if (context.policy === "COMBINED") {
    const snapshot = validateCombinedRules(context);
    if (!snapshot.valid) {
      return decision(context, false, snapshot.code, identity.code);
    }
    const directRule = snapshot.rules.find((rule) => {
      switch (context.identity.kind) {
        case "AFFILIATE":
          return rule.kind === "ACTIVE_AFFILIATE";
        case "BENEFICIARY":
          return rule.kind === "BENEFICIARY";
        case "AUTHORIZED_GUEST":
          return rule.kind === "AUTHORIZED_GUEST";
        case "PARTNER_COMPANY_MEMBER":
          return (
            rule.kind === "PARTNER_COMPANY_MEMBER" &&
            rule.allowedCompanyIds.includes(context.identity.companyId)
          );
      }
    });
    if (directRule !== undefined) {
      return decision(context, true, "ELIGIBLE", identity.code);
    }
    if (snapshot.rules.some((rule) => rule.kind === "CUSTOM_APPROVED")) {
      return validatesCustomApproval(context);
    }
    return decision(
      context,
      false,
      context.identity.kind === "PARTNER_COMPANY_MEMBER" &&
        snapshot.rules.some((rule) => rule.kind === "PARTNER_COMPANY_MEMBER")
        ? "PARTNER_COMPANY_NOT_ALLOWED"
        : "POLICY_DOES_NOT_ALLOW_SUBJECT",
      identity.code,
    );
  }
  if (
    context.identity.kind === "PARTNER_COMPANY_MEMBER" &&
    !context.allowedPartnerCompanyIds.includes(context.identity.companyId)
  ) {
    return decision(
      context,
      false,
      "PARTNER_COMPANY_NOT_ALLOWED",
      identity.code,
    );
  }

  const allowed =
    (context.policy === "AFFILIATES" &&
      context.identity.kind === "AFFILIATE") ||
    (context.policy === "AFFILIATES_AND_BENEFICIARIES" &&
      (context.identity.kind === "AFFILIATE" ||
        context.identity.kind === "BENEFICIARY")) ||
    (context.policy === "PARTNER_COMPANY" &&
      context.identity.kind === "PARTNER_COMPANY_MEMBER") ||
    (context.policy === "AUTHORIZED_GUESTS" &&
      context.identity.kind === "AUTHORIZED_GUEST");

  return allowed
    ? decision(context, true, "ELIGIBLE", identity.code)
    : decision(context, false, "POLICY_DOES_NOT_ALLOW_SUBJECT", identity.code);
}
