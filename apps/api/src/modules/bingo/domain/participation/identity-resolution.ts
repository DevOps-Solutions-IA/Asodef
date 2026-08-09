export type AffiliateIdentityResolution = Readonly<{
  kind: "AFFILIATE";
  subjectKey: string;
  affiliateId: string;
  affiliateStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}>;

export type ExternalAuthorization = Readonly<{
  eventId: string;
  source: string;
  referenceHash: string;
  authorizedAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}>;

export type BeneficiaryIdentityResolution = Readonly<{
  kind: "BENEFICIARY";
  subjectKey: string;
  provider: string;
  ownerAffiliateId: string;
  authorization: ExternalAuthorization;
}>;

export type PartnerCompanyIdentityResolution = Readonly<{
  kind: "PARTNER_COMPANY_MEMBER";
  subjectKey: string;
  companyId: string;
  authorization: ExternalAuthorization;
}>;

export type GuestIdentityResolution = Readonly<{
  kind: "AUTHORIZED_GUEST";
  subjectKey: string;
  authorization: ExternalAuthorization;
}>;

/**
 * An already-resolved, opaque subject reference. This domain never accepts or
 * searches names, documents, phones or emails.
 */
export type IdentityResolution =
  | AffiliateIdentityResolution
  | BeneficiaryIdentityResolution
  | PartnerCompanyIdentityResolution
  | GuestIdentityResolution;

export type IdentityResolutionCode =
  | "IDENTITY_VALID"
  | "INVALID_SUBJECT_KEY"
  | "INVALID_AFFILIATE"
  | "AFFILIATE_NOT_ACTIVE"
  | "INVALID_PROVIDER"
  | "INVALID_OWNER_AFFILIATE"
  | "INVALID_COMPANY"
  | "AUTHORIZATION_EVENT_MISMATCH"
  | "AUTHORIZATION_EVIDENCE_INVALID"
  | "AUTHORIZATION_NOT_YET_VALID"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_REVOKED";

export type IdentityResolutionDecision = Readonly<{
  valid: boolean;
  code: IdentityResolutionCode;
}>;

function nonBlank(value: string): boolean {
  return value.trim().length > 0;
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function validateAuthorization(
  authorization: ExternalAuthorization,
  eventId: string,
  now: Date,
): IdentityResolutionDecision {
  if (authorization.eventId !== eventId) {
    return { valid: false, code: "AUTHORIZATION_EVENT_MISMATCH" };
  }
  if (
    !nonBlank(authorization.source) ||
    !nonBlank(authorization.referenceHash) ||
    !validDate(authorization.authorizedAt)
  ) {
    return { valid: false, code: "AUTHORIZATION_EVIDENCE_INVALID" };
  }
  if (authorization.authorizedAt.getTime() > now.getTime()) {
    return { valid: false, code: "AUTHORIZATION_NOT_YET_VALID" };
  }
  if (authorization.revokedAt !== undefined) {
    return { valid: false, code: "AUTHORIZATION_REVOKED" };
  }
  if (
    authorization.expiresAt !== undefined &&
    authorization.expiresAt.getTime() <= now.getTime()
  ) {
    return { valid: false, code: "AUTHORIZATION_EXPIRED" };
  }
  return { valid: true, code: "IDENTITY_VALID" };
}

export function validateIdentityResolution(
  input: Readonly<{
    identity: IdentityResolution;
    eventId: string;
    now: Date;
  }>,
): IdentityResolutionDecision {
  if (!nonBlank(input.identity.subjectKey)) {
    return { valid: false, code: "INVALID_SUBJECT_KEY" };
  }
  switch (input.identity.kind) {
    case "AFFILIATE":
      if (!nonBlank(input.identity.affiliateId)) {
        return { valid: false, code: "INVALID_AFFILIATE" };
      }
      return input.identity.affiliateStatus === "ACTIVE"
        ? { valid: true, code: "IDENTITY_VALID" }
        : { valid: false, code: "AFFILIATE_NOT_ACTIVE" };
    case "BENEFICIARY":
      if (!nonBlank(input.identity.provider)) {
        return { valid: false, code: "INVALID_PROVIDER" };
      }
      if (!nonBlank(input.identity.ownerAffiliateId)) {
        return { valid: false, code: "INVALID_OWNER_AFFILIATE" };
      }
      return validateAuthorization(
        input.identity.authorization,
        input.eventId,
        input.now,
      );
    case "PARTNER_COMPANY_MEMBER":
      if (!nonBlank(input.identity.companyId)) {
        return { valid: false, code: "INVALID_COMPANY" };
      }
      return validateAuthorization(
        input.identity.authorization,
        input.eventId,
        input.now,
      );
    case "AUTHORIZED_GUEST":
      return validateAuthorization(
        input.identity.authorization,
        input.eventId,
        input.now,
      );
  }
}
