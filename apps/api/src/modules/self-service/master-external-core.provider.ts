import { Injectable } from "@nestjs/common";
import { MasterQueryService } from "../master/application/master-query.service";
import type { Company, Contract, Payment, Person } from "../master/domain/master.models";
import type {
  AffiliateLookupInput,
  ContactDestination,
  ContactUpdateProviderState,
  ExternalCoreProvider,
  LookupProviderResult,
  ProviderCollection,
  ProviderPayload,
  ProviderResult,
  VerificationChannel,
} from "./external-core.provider";

function unavailable<T>(code: string, message: string, retryable = false): ProviderResult<T> {
  return { status: "UNAVAILABLE", error: { code, message, retryable } };
}

function lookupUnavailable(code: string, message: string, disclosureAllowed = false): LookupProviderResult {
  return { status: "UNAVAILABLE", disclosureAllowed, error: { code, message, retryable: false } };
}

function notConfigured<T>(code: string, message: string): ProviderResult<T> {
  return { status: "NOT_CONFIGURED", error: { code, message, retryable: false } };
}

function displayName(person: Person): string {
  const value = [person.names, person.surnames].filter(Boolean).join(" ").trim();
  return value || "Afiliado ASODEF";
}

function contractStatus(contract: Contract): string {
  return contract.legacyStatus ?? "SIN_CLASIFICAR";
}

function paymentPayload(payment: Payment): ProviderPayload {
  return {
    id: payment.receiptNumber,
    reference: payment.receiptNumber,
    amount: payment.amount,
    currency: "COP",
    status: payment.annulled === true ? "ANULADO" : "REGISTRADO",
    date: payment.paidAt,
  };
}

/**
 * Read-only adapter from the public/self-service boundary to the certified
 * Firebird Master bounded context.
 *
 * Important:
 * - It never writes to Firebird.
 * - It does not invent financial/beneficiary/contact-verification semantics.
 * - Capabilities that still require an approved legacy rule fail closed as
 *   NOT_CONFIGURED rather than exposing guessed data.
 */
@Injectable()
export class MasterExternalCoreProvider implements ExternalCoreProvider {
  constructor(private readonly master: MasterQueryService) {}

  async startAffiliateLookup(input: AffiliateLookupInput): Promise<LookupProviderResult> {
    if (input.identifierMode !== "DOCUMENT") {
      return lookupUnavailable(
        "MASTER_TITULAR_LOOKUP_NOT_READY",
        "La consulta por número de titular aún no está habilitada.",
      );
    }
    try {
      const person = await this.master.findPersonByDocument(input.identifier);
      if (!person) {
        return {
          status: "NOT_FOUND",
          disclosureAllowed: false,
          error: { code: "SUBJECT_NOT_FOUND", message: "No fue posible validar el registro.", retryable: false },
        };
      }
      return { status: "VERIFIED", data: { subjectRef: person.personId } };
    } catch {
      return lookupUnavailable(
        "MASTER_LOOKUP_UNAVAILABLE",
        "No fue posible consultar el sistema maestro.",
      );
    }
  }

  async startCompanyLookupByNit(input: { nit: string }): Promise<LookupProviderResult> {
    try {
      const company = await this.master.findCompanyByNit(input.nit);
      if (!company) {
        return {
          status: "NOT_FOUND",
          disclosureAllowed: false,
          error: { code: "COMPANY_NOT_FOUND", message: "No fue posible validar el registro.", retryable: false },
        };
      }
      return { status: "VERIFIED", data: { subjectRef: company.nit } };
    } catch {
      return lookupUnavailable(
        "MASTER_LOOKUP_UNAVAILABLE",
        "No fue posible consultar el sistema maestro.",
      );
    }
  }

  getAffiliateVerificationChannels(_subjectRef: string): Promise<ProviderResult<readonly VerificationChannel[]>> {
    return Promise.resolve(notConfigured(
      "MASTER_VERIFICATION_CHANNELS_NOT_READY",
      "Los contactos del legado todavía no tienen una regla aprobada de verificación y autorización para OTP.",
    ));
  }

  getCompanyVerificationChannels(_subjectRef: string): Promise<ProviderResult<readonly VerificationChannel[]>> {
    return Promise.resolve(notConfigured(
      "MASTER_COMPANY_VERIFICATION_CHANNELS_NOT_READY",
      "Los contactos de empresa todavía no tienen una regla aprobada de verificación y autorización para OTP.",
    ));
  }

  getAffiliateContactDestinations(_subjectRef: string): Promise<ProviderResult<readonly ContactDestination[]>> {
    return Promise.resolve(notConfigured(
      "MASTER_CONTACT_DESTINATIONS_NOT_READY",
      "Los destinos de contacto del legado todavía no están aprobados para autenticación.",
    ));
  }

  getCompanyContactDestinations(_subjectRef: string): Promise<ProviderResult<readonly ContactDestination[]>> {
    return Promise.resolve(notConfigured(
      "MASTER_COMPANY_CONTACT_DESTINATIONS_NOT_READY",
      "Los destinos de contacto de empresa todavía no están aprobados para autenticación.",
    ));
  }

  async getAffiliateSummary(subjectRef: string): Promise<ProviderResult<ProviderPayload>> {
    try {
      const person = await this.master.findPersonByDocument(subjectRef);
      if (!person) return unavailable("SUBJECT_NOT_FOUND", "No fue posible consultar el registro.");
      const contracts = await this.master.getContractsByPerson(person.personId);
      const current = contracts[0] ?? null;
      return {
        status: "VERIFIED",
        data: {
          displayName: displayName(person),
          status: person.withdrawn === true ? "RETIRADO" : (current?.legacyStatus ?? "REGISTRADO"),
          updatedAt: current?.lastPaymentAt ?? person.affiliationDate,
        },
      };
    } catch {
      return unavailable("MASTER_READ_UNAVAILABLE", "No fue posible consultar el sistema maestro.", true);
    }
  }

  getAffiliateBeneficiaries(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured(
      "MASTER_BENEFICIARIES_NOT_READY",
      "La regla de beneficiarios vigentes todavía no está aprobada.",
    ));
  }

  getAffiliateAccountStatement(_subjectRef: string): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured(
      "MASTER_ACCOUNT_STATEMENT_NOT_READY",
      "La regla financiera del estado de cuenta todavía no está aprobada.",
    ));
  }

  getAffiliateObligations(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured(
      "MASTER_OUTSTANDING_OBLIGATIONS_NOT_READY",
      "La regla de obligaciones pendientes todavía no está aprobada.",
    ));
  }

  async getAffiliatePayments(subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    try {
      const contracts = await this.master.getContractsByPerson(subjectRef);
      const histories = await Promise.all(contracts.map((contract) => this.master.getPaymentHistory(contract.contractId)));
      return { status: "VERIFIED", data: histories.flat().map(paymentPayload) };
    } catch {
      return unavailable("MASTER_PAYMENTS_UNAVAILABLE", "No fue posible consultar el historial de pagos.", true);
    }
  }

  getAffiliateReceipts(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured(
      "MASTER_RECEIPTS_NOT_READY",
      "El detalle de recibos todavía no tiene un catálogo aprobado.",
    ));
  }

  getAffiliateDocuments(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_DOCUMENTS_NOT_READY", "Los documentos del legado todavía no están integrados."));
  }

  getAffiliateRequests(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_REQUESTS_NOT_READY", "Las solicitudes del legado todavía no están integradas."));
  }

  getAffiliateBeneficiaryRules(_subjectRef: string): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_BENEFICIARY_RULES_NOT_READY", "Las reglas de beneficiarios todavía no están aprobadas."));
  }

  listAffiliateBeneficiaryChangeRequests(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_BENEFICIARY_CHANGES_NOT_READY", "Los cambios de beneficiarios todavía no están integrados."));
  }

  getAffiliateBeneficiaryChangeRequest(_subjectRef: string, _requestId: string): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_BENEFICIARY_CHANGES_NOT_READY", "Los cambios de beneficiarios todavía no están integrados."));
  }

  createAffiliateBeneficiaryChangeRequest(_subjectRef: string, _payload: ProviderPayload, _idempotencyKey: string): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "El adaptador Master es de solo lectura."));
  }

  updateAffiliateBeneficiaryChangeRequest(_subjectRef: string, _requestId: string, _payload: ProviderPayload, _idempotencyKey: string): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "El adaptador Master es de solo lectura."));
  }

  uploadAffiliateBeneficiaryChangeDocument(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "El adaptador Master es de solo lectura."));
  }

  submitAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "El adaptador Master es de solo lectura."));
  }

  cancelAffiliateBeneficiaryChangeRequest(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "El adaptador Master es de solo lectura."));
  }

  submitAffiliateContactUpdate(): Promise<ProviderResult<ContactUpdateProviderState>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "El adaptador Master es de solo lectura."));
  }

  getAffiliateContactUpdate(): Promise<ProviderResult<ContactUpdateProviderState>> {
    return Promise.resolve(notConfigured("MASTER_CONTACT_UPDATES_NOT_READY", "Los cambios de contacto todavía no están integrados."));
  }

  async getCompanySummary(subjectRef: string): Promise<ProviderResult<ProviderPayload>> {
    try {
      const company = await this.master.findCompanyByNit(subjectRef);
      if (!company) return unavailable("COMPANY_NOT_FOUND", "No fue posible consultar la empresa.");
      const contracts = await this.master.getCompanyContracts(company.nit);
      return {
        status: "VERIFIED",
        data: {
          displayName: company.name ?? "Empresa ASODEF",
          status: company.status ?? (contracts.length > 0 ? "REGISTRADA" : "SIN_CONTRATOS"),
          updatedAt: contracts[0]?.createdAt ?? null,
        },
      };
    } catch {
      return unavailable("MASTER_COMPANY_UNAVAILABLE", "No fue posible consultar la empresa.", true);
    }
  }

  getCompanyBenefits(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_COMPANY_BENEFITS_NOT_READY", "Los beneficios de empresa todavía no están integrados."));
  }

  async getCompanyContracts(subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    try {
      const contracts = await this.master.getCompanyContracts(subjectRef);
      return {
        status: "VERIFIED",
        data: contracts.map((contract) => ({
          id: contract.contractId,
          reference: contract.contractId,
          title: contract.planId ? `Plan ${contract.planId}` : "Contrato ASODEF",
          status: contractStatus(contract),
          effectiveDate: contract.validFrom,
          updatedAt: contract.lastPaymentAt ?? contract.createdAt,
        })),
      };
    } catch {
      return unavailable("MASTER_COMPANY_CONTRACTS_UNAVAILABLE", "No fue posible consultar los contratos de la empresa.", true);
    }
  }

  async getCompanyPayments(subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    try {
      const contracts = await this.master.getCompanyContracts(subjectRef);
      const histories = await Promise.all(contracts.map((contract) => this.master.getPaymentHistory(contract.contractId)));
      return { status: "VERIFIED", data: histories.flat().map(paymentPayload) };
    } catch {
      return unavailable("MASTER_COMPANY_PAYMENTS_UNAVAILABLE", "No fue posible consultar los pagos de la empresa.", true);
    }
  }

  getCompanyDocuments(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_COMPANY_DOCUMENTS_NOT_READY", "Los documentos de empresa todavía no están integrados."));
  }

  getCompanyRequests(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_COMPANY_REQUESTS_NOT_READY", "Las solicitudes de empresa todavía no están integradas."));
  }

  getCompanyReports(_subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(notConfigured("MASTER_COMPANY_REPORTS_NOT_READY", "Los reportes de empresa todavía no están integrados."));
  }

  quotePayment(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_PAYMENT_RULE_NOT_READY", "La regla de obligación cobrable todavía no está aprobada."));
  }

  applyConfirmedPayment(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "Los pagos no se aplican directamente sobre Firebird."));
  }

  getPaymentApplication(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_PAYMENT_APPLICATION_NOT_READY", "La aplicación de pagos todavía no está integrada."));
  }

  reversePayment(): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(notConfigured("MASTER_WRITE_DISABLED", "Las reversas no se ejecutan directamente sobre Firebird."));
  }
}
