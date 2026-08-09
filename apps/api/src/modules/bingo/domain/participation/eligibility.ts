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
  | "CUSTOM_APPROVAL_AFTER_FREEZE";

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
    !Number.isFinite(approval.approvedAt.getTime()) ||
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

  if (context.policy === "CUSTOM_APPROVED") {
    return validatesCustomApproval(context);
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
    context.policy === "COMBINED" ||
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
