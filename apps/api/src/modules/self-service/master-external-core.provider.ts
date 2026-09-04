import { Injectable } from "@nestjs/common";
import { MasterQueryService } from "../master/application/master-query.service";
import { positiveMasterDecimalToCents } from "../master/domain/master-money";
import { payableInstallmentStatus } from "../master/domain/master-payable-installments";
import type { Contract, Payment, Person } from "../master/domain/master.models";
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
import { maskMobile, normalizeColombianMobile } from "./colombian-mobile";

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

function contractPayload(contract: Contract): ProviderPayload {
  return {
    id: contract.contractId,
    reference: contract.contractId,
    title: contract.planId ? `Plan ${contract.planId}` : "Contrato ASODEF",
    status: contractStatus(contract),
    effectiveDate: contract.validFrom,
    updatedAt: contract.lastPaymentAt ?? contract.createdAt,
  };
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

function payloadString(payload: ProviderPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
          error: { code: "COMPANY_NOT_FOUND", message: "No fue posible validar la empresa.", retryable: false },
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

  async getAffiliateVerificationChannels(subjectRef: string): Promise<ProviderResult<readonly VerificationChannel[]>> {
    const destinations = await this.getAffiliateContactDestinations(subjectRef);
    if (destinations.status !== "VERIFIED") return destinations;
    return {
      status: "VERIFIED",
      data: destinations.data.map((destination) => ({
        id: destination.id,
        type: destination.type,
        masked: maskMobile(destination.destination),
        enabled: destination.enabled,
        verified: destination.verified,
        operationalCommunicationPermission: destination.operationalCommunicationPermission,
      })),
    };
  }

  async getCompanyVerificationChannels(subjectRef: string): Promise<ProviderResult<readonly VerificationChannel[]>> {
    const destinations = await this.getCompanyContactDestinations(subjectRef);
    if (destinations.status !== "VERIFIED") return destinations;
    return {
      status: "VERIFIED",
      data: destinations.data.map((destination) => ({
        id: destination.id,
        type: destination.type,
        masked: maskMobile(destination.destination),
        enabled: destination.enabled,
        verified: destination.verified,
        operationalCommunicationPermission: destination.operationalCommunicationPermission,
      })),
    };
  }

  async getAffiliateContactDestinations(subjectRef: string): Promise<ProviderResult<readonly ContactDestination[]>> {
    try {
      const person = await this.master.findPersonByDocument(subjectRef);
      if (!person) return unavailable("SUBJECT_NOT_FOUND", "No fue posible consultar el registro.");

      const candidates = [
        { id: "legacy-whatsapp", value: person.whatsapp },
        { id: "legacy-phone", value: person.phone },
      ];
      const seen = new Set<string>();
      const data: ContactDestination[] = [];
      for (const candidate of candidates) {
        if (!candidate.value) continue;
        const destination = normalizeColombianMobile(candidate.value);
        if (!destination || seen.has(destination)) continue;
        seen.add(destination);
        data.push({
          id: candidate.id,
          type: "whatsapp",
          destination,
          enabled: true,
          verified: true,
          operationalCommunicationPermission: true,
        });
      }
      return { status: "VERIFIED", data };
    } catch {
      return unavailable("MASTER_CONTACTS_UNAVAILABLE", "No fue posible consultar los contactos registrados.", true);
    }
  }

  async getCompanyContactDestinations(subjectRef: string): Promise<ProviderResult<readonly ContactDestination[]>> {
    try {
      const company = await this.master.findCompanyByNit(subjectRef);
      if (!company) return unavailable("COMPANY_NOT_FOUND", "No fue posible consultar la empresa.");

      const candidates = [
        { id: "company-contact-mobile", value: company.contactMobile },
        { id: "company-contact-phone", value: company.contactPhone },
        { id: "company-phone-2", value: company.phone2 },
        { id: "company-phone", value: company.phone },
      ];
      const seen = new Set<string>();
      const data: ContactDestination[] = [];
      for (const candidate of candidates) {
        if (!candidate.value) continue;
        const destination = normalizeColombianMobile(candidate.value);
        if (!destination || seen.has(destination)) continue;
        seen.add(destination);
        data.push({
          id: candidate.id,
          type: "whatsapp",
          destination,
          enabled: true,
          verified: true,
          operationalCommunicationPermission: true,
        });
      }
      return { status: "VERIFIED", data };
    } catch {
      return unavailable("MASTER_COMPANY_CONTACTS_UNAVAILABLE", "No fue posible consultar los contactos registrados de la empresa.", true);
    }
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

  async getAffiliateContracts(subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    try {
      const contracts = await this.master.getContractsByPerson(subjectRef);
      return { status: "VERIFIED", data: contracts.map(contractPayload) };
    } catch {
      return unavailable("MASTER_AFFILIATE_CONTRACTS_UNAVAILABLE", "No fue posible consultar los contratos del afiliado.", true);
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

  async getAffiliateObligations(subjectRef: string): Promise<ProviderResult<ProviderCollection>> {
    try {
      const contracts = await this.master.getContractsByPerson(subjectRef);
      const groups = await Promise.all(
        contracts.map(async (contract) => ({
          contract,
          installments: await this.master.getOutstandingInstallments(contract.contractId),
        })),
      );
      return {
        status: "VERIFIED",
        data: groups.flatMap(({ contract, installments }) =>
          installments.map((installment) => ({
            id: installment.installmentId,
            reference: contract.contractId,
            label: installment.installmentNumber === null
              ? "Cuota ASODEF"
              : `Cuota ${installment.installmentNumber}`,
            amount: installment.balance,
            currency: "COP",
            status: payableInstallmentStatus(installment),
            dueDate: installment.dueDate,
          })),
        ),
      };
    } catch {
      return unavailable("MASTER_OBLIGATIONS_UNAVAILABLE", "No fue posible consultar las obligaciones.", true);
    }
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
      return { status: "VERIFIED", data: contracts.map(contractPayload) };
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

  /**
   * Read-only quote for the certified payable-installment rule. The caller must
   * supply a contractId + installmentId that was previously listed for the
   * authenticated subject. Ownership and current payability are always re-read
   * from Master; amountCents is derived exactly from the current Firebird
   * decimal, never from browser/client input.
   */
  async quotePayment(subjectRef: string, payload: ProviderPayload): Promise<ProviderResult<ProviderPayload>> {
    const contractId = payloadString(payload, "contractId");
    const installmentId = payloadString(payload, "installmentId");
    if (!contractId || !installmentId) {
      return unavailable("MASTER_PAYMENT_SELECTION_INVALID", "No fue posible validar la obligación seleccionada.");
    }

    try {
      const contracts = await this.master.getContractsByPerson(subjectRef);
      const contract = contracts.find((candidate) => candidate.contractId === contractId);
      if (!contract) {
        return unavailable("MASTER_PAYMENT_SELECTION_INVALID", "No fue posible validar la obligación seleccionada.");
      }

      const installments = await this.master.getOutstandingInstallments(contract.contractId);
      const installment = installments.find((candidate) => candidate.installmentId === installmentId);
      if (!installment) {
        return unavailable("MASTER_PAYMENT_NOT_PAYABLE", "La obligación seleccionada ya no está disponible para pago.");
      }

      const amountCents = positiveMasterDecimalToCents(installment.balance);
      if (amountCents === null || !installment.dueDate) {
        return unavailable("MASTER_PAYMENT_QUOTE_INVALID", "No fue posible calcular el valor actual de la obligación.");
      }

      return {
        status: "VERIFIED",
        data: {
          id: installment.installmentId,
          reference: contract.contractId,
          label: installment.installmentNumber === null ? "Cuota ASODEF" : `Cuota ${installment.installmentNumber}`,
          amount: installment.balance,
          amountCents,
          currency: "COP",
          status: payableInstallmentStatus(installment),
          dueDate: installment.dueDate,
        },
      };
    } catch {
      return unavailable("MASTER_PAYMENT_QUOTE_UNAVAILABLE", "No fue posible verificar la obligación en el sistema maestro.", true);
    }
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
