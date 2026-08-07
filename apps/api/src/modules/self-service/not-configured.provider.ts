import { Injectable } from "@nestjs/common";
import type {
  ContactDestination,
  ExternalCoreProvider,
  LookupProviderResult,
  ProviderCollection,
  ProviderPayload,
  ProviderResult,
  SelfServiceMessageProvider,
  VerificationChannel,
} from "./external-core.provider";

function notConfigured<T>(): Promise<ProviderResult<T>> {
  return Promise.resolve({
    status: "NOT_CONFIGURED",
    error: {
      code: "EXTERNAL_CORE_NOT_CONFIGURED",
      message: "El servicio externo de autoservicio no está configurado.",
      retryable: false,
    },
  });
}

@Injectable()
export class NotConfiguredExternalCoreProvider implements ExternalCoreProvider {
  startAffiliateLookup(): Promise<LookupProviderResult> { return Promise.resolve({ status: "NOT_CONFIGURED", disclosureAllowed: false, error: { code: "EXTERNAL_CORE_NOT_CONFIGURED", message: "El servicio externo de autoservicio no está configurado.", retryable: false } }); }
  startCompanyLookupByNit(): Promise<LookupProviderResult> { return Promise.resolve({ status: "NOT_CONFIGURED", disclosureAllowed: false, error: { code: "EXTERNAL_CORE_NOT_CONFIGURED", message: "El servicio externo de autoservicio no está configurado.", retryable: false } }); }
  getAffiliateVerificationChannels(): Promise<ProviderResult<readonly VerificationChannel[]>> { return notConfigured(); }
  getCompanyVerificationChannels(): Promise<ProviderResult<readonly VerificationChannel[]>> { return notConfigured(); }
  getAffiliateContactDestinations(): Promise<ProviderResult<readonly ContactDestination[]>> { return notConfigured(); }
  getCompanyContactDestinations(): Promise<ProviderResult<readonly ContactDestination[]>> { return notConfigured(); }
  getAffiliateSummary(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  getAffiliateBeneficiaries(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliateAccountStatement(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  getAffiliateObligations(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliatePayments(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliateReceipts(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliateDocuments(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliateRequests(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliateBeneficiaryRules(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  listAffiliateBeneficiaryChangeRequests(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  createAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  updateAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  uploadAffiliateBeneficiaryChangeDocument(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  submitAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  cancelAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  submitAffiliateContactUpdate(): Promise<ProviderResult<import("./external-core.provider").ContactUpdateProviderState>> { return notConfigured(); }
  getAffiliateContactUpdate(): Promise<ProviderResult<import("./external-core.provider").ContactUpdateProviderState>> { return notConfigured(); }
  getCompanySummary(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  getCompanyBenefits(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getCompanyContracts(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getCompanyPayments(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getCompanyDocuments(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getCompanyRequests(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  getCompanyReports(): Promise<ProviderResult<ProviderCollection>> { return notConfigured(); }
  quotePayment(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  applyConfirmedPayment(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  getPaymentApplication(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
  reversePayment(): Promise<ProviderResult<ProviderPayload>> { return notConfigured(); }
}

@Injectable()
export class NotConfiguredSelfServiceMessageProvider implements SelfServiceMessageProvider {
  deliverOtp(): Promise<ProviderResult<{ delivered: true }>> {
    return Promise.resolve({ status: "NOT_CONFIGURED", error: { code: "OTP_DELIVERY_NOT_CONFIGURED", message: "El envío de códigos no está configurado.", retryable: false } });
  }
  notifyContactUpdated(): Promise<ProviderResult<{ delivered: true }>> {
    return Promise.resolve({ status: "NOT_CONFIGURED", error: { code: "CONTACT_NOTIFICATION_NOT_CONFIGURED", message: "La notificación de cambios no está configurada.", retryable: false } });
  }
}
