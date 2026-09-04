export type SelfServiceSessionStatus =
  | "anonymous"
  | "lookup_pending"
  | "challenge_required"
  | "verified"
  | "expired"
  | "provider_unavailable"
  | "locked";

export type SelfServiceResourceStatus =
  | "loading"
  | "empty"
  | "not_configured"
  | "unavailable"
  | "expired"
  | "unauthorized"
  | "partial"
  | "success";

export type SelfServiceChannelKind = "sms" | "email" | "whatsapp";
export type SelfServiceAssurance = "OTP" | "LOOKUP";

export interface MaskedChallengeChannel {
  id: string;
  kind: SelfServiceChannelKind;
  maskedDestination: string;
  available: boolean;
  enabled: boolean;
  cooldownSeconds?: number;
  providerReference?: string;
}

export interface SelfServiceSessionState {
  status: SelfServiceSessionStatus;
  challengeId?: string;
  providerReference?: string;
  channels?: readonly MaskedChallengeChannel[];
  selectedChannelId?: string;
  codeSent?: boolean;
  expiresAt?: string;
  scopes?: readonly string[];
  csrfToken?: string;
  assurance?: SelfServiceAssurance;
  message?: string;
}

export type AccessStartResult =
  | { status: "VERIFIED"; expiresAt: string; scopes: readonly string[]; csrfToken: string; assurance: SelfServiceAssurance }
  | { status: "CHALLENGE_REQUIRED"; providerReference: string; channels: readonly { providerReference: string; channel: SelfServiceChannelKind; maskedDestination: string; availability: string; cooldownSeconds?: number }[]; expiresAt?: string }
  | { status: "LOCKED" | "EXPIRED"; message?: string }
  | { status: "NOT_CONFIGURED" | "UNAVAILABLE"; error: ProviderError };

export type ChallengeRequestResult =
  | { status: "CHALLENGE_REQUIRED"; challengeId: string; channel: SelfServiceChannelKind; maskedDestination: string; expiresAt?: string; retryAfterSeconds?: number }
  | { status: "LOCKED" | "EXPIRED"; message?: string }
  | { status: "NOT_CONFIGURED" | "UNAVAILABLE"; error: ProviderError };

export type AccessVerifyResult =
  | { status: "VERIFIED"; expiresAt: string; scopes: readonly string[]; csrfToken: string; assurance: SelfServiceAssurance }
  | { status: "LOCKED" | "EXPIRED"; message?: string }
  | { status: "NOT_CONFIGURED" | "UNAVAILABLE"; error: ProviderError };

export type SessionResult =
  | { status: "VERIFIED"; expiresAt: string; scopes: readonly string[]; csrfToken?: string; assurance: SelfServiceAssurance }
  | { status: "ANONYMOUS" | "EXPIRED" | "LOCKED"; message?: string }
  | { status: "NOT_CONFIGURED" | "UNAVAILABLE"; error: ProviderError };

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
}

export type ProviderResult<T> =
  | { status: "VERIFIED"; data: T }
  | { status: "NOT_CONFIGURED" | "UNAVAILABLE"; error: ProviderError };

export type ResourceResult<T> =
  | { status: "success"; data: T }
  | { status: "partial"; data: T; message: string }
  | { status: "empty"; message?: string }
  | { status: "not_configured" | "unavailable" | "expired" | "unauthorized"; message?: string };

export interface AffiliateAccessInput {
  identifier: string;
  documentType?: string;
  identifierMode: "TITULAR_NUMBER" | "DOCUMENT";
}

export interface CompanyAccessInput {
  nit: string;
}

export interface ChallengeRequestInput {
  providerReference: string;
  channelReference: string;
}

export interface ChallengeResendInput { challengeId: string }

export interface ChallengeVerifyInput {
  challengeId: string;
  code: string;
}

export type ProviderPayload = Readonly<Record<string, unknown>>;
export type ProviderCollection = readonly ProviderPayload[];

export interface SummaryData extends ProviderPayload {
  displayName?: string;
  status?: string;
  reference?: string;
  updatedAt?: string;
  notices?: readonly string[];
}

export interface AffiliationData extends ProviderPayload {
  status?: string;
  holderReference?: string;
  companyName?: string;
  planName?: string;
  effectiveDate?: string;
}

export interface BeneficiaryData extends ProviderPayload {
  id?: string;
  displayName?: string;
  relationship?: string;
  status?: string;
}

export interface AccountStatementData extends ProviderPayload {
  balanceLabel?: string;
  balance?: string;
  cutoffDate?: string;
  entries?: readonly ProviderPayload[];
}

export type BeneficiaryOperation = "ADD" | "UPDATE" | "REMOVE";
export type BeneficiaryRequestStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "APPLIED" | "REJECTED" | "CANCELLED";

export interface BeneficiaryChangeRequestData extends ProviderPayload {
  id?: string;
  operation?: BeneficiaryOperation;
  status?: BeneficiaryRequestStatus;
  beneficiaryId?: string;
  beneficiaryDisplayName?: string;
  relationship?: string;
  reason?: string;
  documents?: readonly ProviderPayload[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BeneficiaryDraftInput {
  operation: BeneficiaryOperation;
  beneficiaryId?: string;
  beneficiaryDisplayName?: string;
  relationship?: string;
  reason?: string;
}

export type SelfServiceScope = "affiliate" | "company";
