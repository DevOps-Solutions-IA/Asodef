export const EXTERNAL_CORE_PROVIDER = Symbol("EXTERNAL_CORE_PROVIDER");
export const SELF_SERVICE_MESSAGE_PROVIDER = Symbol("SELF_SERVICE_MESSAGE_PROVIDER");

export type ProviderFailureStatus = "NOT_CONFIGURED" | "UNAVAILABLE";
export type ProviderResult<T> =
  | { status: "VERIFIED"; data: T }
  | { status: ProviderFailureStatus; error: { code: string; message: string; retryable: boolean } };

export type ProviderPayload = Readonly<Record<string, unknown>>;
export type ProviderCollection = readonly ProviderPayload[];
export type SelfServiceChannel = "email" | "sms" | "whatsapp";
export type VerificationChannel = {
  id: string;
  type: SelfServiceChannel;
  masked: string;
  enabled: boolean;
  verified: boolean;
  lastUpdatedAt?: string;
  operationalCommunicationPermission: boolean;
};
export type ContactDestination = {
  id: string;
  type: SelfServiceChannel;
  destination: string;
  enabled: boolean;
  verified: boolean;
  lastUpdatedAt?: string;
  operationalCommunicationPermission: boolean;
};
export type LookupResult = { subjectRef: string };
export type LookupFailureStatus = "NOT_CONFIGURED" | "NOT_FOUND" | "VERIFICATION_REQUIRED" | "UNAVAILABLE";
export type LookupProviderResult =
  | { status: "VERIFIED"; data: LookupResult }
  | { status: LookupFailureStatus; disclosureAllowed: boolean; error: { code: string; message: string; retryable: boolean } };
export type AffiliateIdentifierMode = "TITULAR_NUMBER" | "DOCUMENT";
export type AffiliateDocumentType = "CC" | "CE" | "TI" | "PA" | "PPT";
export type AffiliateLookupInput =
  | { identifierMode: "TITULAR_NUMBER"; identifier: string }
  | { identifierMode: "DOCUMENT"; documentType: AffiliateDocumentType; identifier: string };
export type BeneficiaryDocumentUpload = { documentType: string; originalName: string; mimeType: string; size: number; buffer: Buffer };
export type ContactUpdateProviderState = {
  providerReference: string;
  status: "PENDING" | "APPLIED" | "REJECTED";
  updatedAt?: string;
  notificationPermissions?: {
    previousDestination: boolean;
    newDestination: boolean;
  };
};

export interface ExternalCoreProvider {
  startAffiliateLookup(input: AffiliateLookupInput): Promise<LookupProviderResult>;
  startCompanyLookupByNit(input: { nit: string }): Promise<LookupProviderResult>;
  getAffiliateVerificationChannels(subjectRef: string): Promise<ProviderResult<readonly VerificationChannel[]>>;
  getCompanyVerificationChannels(subjectRef: string): Promise<ProviderResult<readonly VerificationChannel[]>>;
  getAffiliateContactDestinations(subjectRef: string): Promise<ProviderResult<readonly ContactDestination[]>>;
  getCompanyContactDestinations(subjectRef: string): Promise<ProviderResult<readonly ContactDestination[]>>;

  getAffiliateSummary(subjectRef: string): Promise<ProviderResult<ProviderPayload>>;
  getAffiliateContracts(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateBeneficiaries(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateAccountStatement(subjectRef: string): Promise<ProviderResult<ProviderPayload>>;
  getAffiliateObligations(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliatePayments(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateReceipts(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateDocuments(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateRequests(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateBeneficiaryRules(subjectRef: string): Promise<ProviderResult<ProviderPayload>>;
  listAffiliateBeneficiaryChangeRequests(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getAffiliateBeneficiaryChangeRequest(subjectRef: string, requestId: string): Promise<ProviderResult<ProviderPayload>>;
  createAffiliateBeneficiaryChangeRequest(subjectRef: string, payload: ProviderPayload, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
  updateAffiliateBeneficiaryChangeRequest(subjectRef: string, requestId: string, payload: ProviderPayload, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
  uploadAffiliateBeneficiaryChangeDocument(subjectRef: string, requestId: string, upload: BeneficiaryDocumentUpload, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
  submitAffiliateBeneficiaryChangeRequest(subjectRef: string, requestId: string, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
  cancelAffiliateBeneficiaryChangeRequest(subjectRef: string, requestId: string, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
  submitAffiliateContactUpdate(subjectRef: string, input: { channel: SelfServiceChannel; destination: string; verificationReference: string }, idempotencyKey: string): Promise<ProviderResult<ContactUpdateProviderState>>;
  getAffiliateContactUpdate(subjectRef: string, providerReference: string): Promise<ProviderResult<ContactUpdateProviderState>>;

  getCompanySummary(subjectRef: string): Promise<ProviderResult<ProviderPayload>>;
  getCompanyBenefits(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getCompanyContracts(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getCompanyPayments(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getCompanyDocuments(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getCompanyRequests(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;
  getCompanyReports(subjectRef: string): Promise<ProviderResult<ProviderCollection>>;

  quotePayment(subjectRef: string, payload: ProviderPayload): Promise<ProviderResult<ProviderPayload>>;
  applyConfirmedPayment(subjectRef: string, payload: ProviderPayload, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
  getPaymentApplication(subjectRef: string, applicationId: string): Promise<ProviderResult<ProviderPayload>>;
  reversePayment(subjectRef: string, payload: ProviderPayload, idempotencyKey: string): Promise<ProviderResult<ProviderPayload>>;
}

export interface SelfServiceMessageProvider {
  deliverOtp(input: { channel: SelfServiceChannel; destination: string; code: string; expiresInMinutes: number }): Promise<ProviderResult<{ delivered: true }>>;
  notifyContactUpdated(input: { channel: SelfServiceChannel; destination: string; purpose: "CONTACT_UPDATE_CONFIRMATION"; audience: "PREVIOUS_DESTINATION" | "NEW_DESTINATION" }): Promise<ProviderResult<{ delivered: true }>>;
}
