import { Injectable } from "@nestjs/common";
import type { AffiliateStatus, CompanyStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { MasterQueryService } from "../master/application/master-query.service";
import { MasterDomainError } from "../master/domain/master.errors";
import type {
  Company as MasterCompany,
  Contract as MasterContract,
  Payment as MasterPayment,
  Person,
} from "../master/domain/master.models";
import { OUTSTANDING_OBLIGATION_STATUSES } from "../payment-orders/payment-orders.service";
import { maskDocumentNumber } from "../payments-lookup/mask-document-number";
import type {
  AffiliateLookupInput,
  BeneficiaryDocumentUpload,
  ContactDestination,
  ContactUpdateProviderState,
  ExternalCoreProvider,
  LookupProviderResult,
  ProviderCollection,
  ProviderPayload,
  ProviderResult,
  SelfServiceChannel,
  VerificationChannel,
} from "./external-core.provider";

const SUBJECT_PREFIX = "hybrid:v1:";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLETED_PAYMENT_STATUSES = [
  "APPROVED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

type AffiliateSubject = {
  version: 1;
  portal: "AFFILIATE";
  masterPersonId: string;
  documentNumber: string;
  documentType: string;
  postgresCustomerId?: string;
  postgresAffiliateId?: string;
};

type CompanySubject = {
  version: 1;
  portal: "COMPANY";
  masterNit: string;
  postgresCompanyId?: string;
};

type HybridSubject = AffiliateSubject | CompanySubject;

class HybridBoundaryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
    this.name = "HybridBoundaryError";
  }
}

function unavailable<T>(code: string, retryable = false): ProviderResult<T> {
  return {
    status: "UNAVAILABLE",
    error: {
      code,
      message:
        "La operación no está disponible con la evidencia de origen actual.",
      retryable,
    },
  };
}

function lookupUnavailable(
  code: string,
  retryable = false,
): LookupProviderResult {
  return {
    status: "UNAVAILABLE",
    disclosureAllowed: false,
    error: {
      code,
      message: "No fue posible verificar la identidad.",
      retryable,
    },
  };
}

function lookupNotFound(): LookupProviderResult {
  return {
    status: "NOT_FOUND",
    disclosureAllowed: false,
    error: {
      code: "SUBJECT_NOT_FOUND",
      message: "No fue posible verificar la identidad.",
      retryable: false,
    },
  };
}

/**
 * Internal, server-only adapter joining source-owned facts without changing
 * their authority. Firebird is reachable only through MasterQueryService;
 * PostgreSQL is reachable only through PrismaService.
 *
 * The subject reference is never a browser credential. SelfServiceAccessService
 * stores it encrypted and only creates an opaque, browser-bound session after
 * OTP verification. The embedded crosswalk is minted only from exact canonical
 * identifiers; it is revalidated before every PostgreSQL-backed read.
 */
@Injectable()
export class HybridExternalCoreProvider implements ExternalCoreProvider {
  constructor(
    private readonly master: MasterQueryService,
    private readonly prisma: PrismaService,
  ) {}

  async startAffiliateLookup(
    input: AffiliateLookupInput,
  ): Promise<LookupProviderResult> {
    if (input.identifierMode !== "DOCUMENT") {
      return lookupUnavailable(
        "AFFILIATE_TITULAR_NUMBER_SEMANTICS_NOT_APPROVED",
      );
    }

    try {
      const identifier = input.identifier.trim();
      const person = await this.master.findPersonByDocument(identifier);
      if (
        !person ||
        person.document !== identifier ||
        person.documentType !== input.documentType
      ) {
        return lookupNotFound();
      }

      const customer = await this.prisma.customer.findUnique({
        where: {
          documentType_documentNumber: {
            documentType: input.documentType,
            documentNumber: identifier,
          },
        },
        select: { id: true },
      });

      let postgresCrosswalk: Pick<
        AffiliateSubject,
        "postgresCustomerId" | "postgresAffiliateId"
      > = {};
      if (customer) {
        const affiliates = await this.prisma.affiliate.findMany({
          where: { customerId: customer.id },
          select: { id: true },
          take: 2,
        });
        if (affiliates.length === 1 && affiliates[0]) {
          postgresCrosswalk = {
            postgresCustomerId: customer.id,
            postgresAffiliateId: affiliates[0].id,
          };
        }
      }

      return {
        status: "VERIFIED",
        data: {
          subjectRef: this.encodeSubject({
            version: 1,
            portal: "AFFILIATE",
            masterPersonId: person.personId,
            documentNumber: person.document,
            documentType: input.documentType,
            ...postgresCrosswalk,
          }),
        },
      };
    } catch (error) {
      return this.lookupFailure(error);
    }
  }

  async startCompanyLookupByNit(input: {
    nit: string;
  }): Promise<LookupProviderResult> {
    try {
      const nit = input.nit.trim();
      const company = await this.master.findCompanyByNit(nit);
      if (!company || company.nit !== nit) return lookupNotFound();

      const postgresCompany = await this.prisma.company.findUnique({
        where: { nit },
        select: { id: true },
      });

      return {
        status: "VERIFIED",
        data: {
          subjectRef: this.encodeSubject({
            version: 1,
            portal: "COMPANY",
            masterNit: company.nit,
            ...(postgresCompany
              ? { postgresCompanyId: postgresCompany.id }
              : {}),
          }),
        },
      };
    } catch (error) {
      return this.lookupFailure(error);
    }
  }

  getAffiliateVerificationChannels(
    _subjectRef: string,
  ): Promise<ProviderResult<readonly VerificationChannel[]>> {
    return Promise.resolve(
      unavailable("VERIFIED_CONTACT_CHANNEL_SEMANTICS_NOT_APPROVED"),
    );
  }

  getCompanyVerificationChannels(
    _subjectRef: string,
  ): Promise<ProviderResult<readonly VerificationChannel[]>> {
    return Promise.resolve(
      unavailable("VERIFIED_CONTACT_CHANNEL_SEMANTICS_NOT_APPROVED"),
    );
  }

  getAffiliateContactDestinations(
    _subjectRef: string,
  ): Promise<ProviderResult<readonly ContactDestination[]>> {
    return Promise.resolve(
      unavailable("CONTACT_DESTINATION_PERMISSION_SEMANTICS_NOT_APPROVED"),
    );
  }

  getCompanyContactDestinations(
    _subjectRef: string,
  ): Promise<ProviderResult<readonly ContactDestination[]>> {
    return Promise.resolve(
      unavailable("CONTACT_DESTINATION_PERMISSION_SEMANTICS_NOT_APPROVED"),
    );
  }

  getAffiliateSummary(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return this.run(async () => {
      const { subject, person, postgres } =
        await this.affiliateContext(subjectRef);
      const displayName =
        [person.names, person.surnames].filter(Boolean).join(" ") ||
        postgres?.fullName;
      return this.verifiedPayload({
        ...(displayName ? { displayName } : {}),
        identifierMasked: maskDocumentNumber(
          person.document ?? subject.documentNumber,
        ),
        ...(postgres ? { status: postgres.affiliateStatus } : {}),
      });
    });
  }

  getAffiliateBeneficiaries(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(
      unavailable("MASTER_BENEFICIARY_SEMANTICS_NOT_APPROVED"),
    );
  }

  getAffiliateAccountStatement(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("ACCOUNT_STATEMENT_SEMANTICS_NOT_APPROVED"),
    );
  }

  getAffiliateObligations(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { postgres } = await this.affiliateContext(subjectRef);
      if (!postgres)
        throw new HybridBoundaryError("POSTGRES_CROSSWALK_REQUIRED");
      const obligations = await this.prisma.obligation.findMany({
        where: {
          customerId: postgres.customerId,
          status: { in: [...OUTSTANDING_OBLIGATION_STATUSES] },
        },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          concept: true,
          amountCents: true,
          currency: true,
          status: true,
          dueDate: true,
        },
      });
      return this.verifiedCollection(
        obligations.map((obligation) => ({
          id: obligation.id,
          reference: obligation.id,
          label: obligation.concept,
          amount: this.centsToDecimal(obligation.amountCents),
          currency: obligation.currency,
          status: obligation.status,
          dueDate: obligation.dueDate.toISOString(),
        })),
      );
    });
  }

  getAffiliatePayments(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { subject, postgres } = await this.affiliateContext(subjectRef);
      const contracts = await this.master.getContractsByPerson(
        subject.masterPersonId,
      );
      const legacyPayments = await this.legacyPayments(contracts);
      const digitalPayments = postgres
        ? await this.prisma.paymentOrder.findMany({
            where: {
              customerId: postgres.customerId,
              status: { in: [...COMPLETED_PAYMENT_STATUSES] },
            },
            orderBy: { createdAt: "desc" },
            select: {
              publicReference: true,
              amountCents: true,
              currency: true,
              status: true,
              createdAt: true,
            },
          })
        : [];
      return this.verifiedCollection([
        ...legacyPayments.map((payment) => this.mapLegacyPayment(payment)),
        ...digitalPayments.map((payment) => ({
          id: `postgres:${payment.publicReference}`,
          reference: payment.publicReference,
          amount: this.centsToDecimal(payment.amountCents),
          currency: payment.currency,
          status: payment.status,
          date: payment.createdAt.toISOString(),
        })),
      ]);
    });
  }

  getAffiliateReceipts(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { postgres } = await this.affiliateContext(subjectRef);
      if (!postgres)
        throw new HybridBoundaryError("POSTGRES_CROSSWALK_REQUIRED");
      const receipts = await this.prisma.paymentReceipt.findMany({
        where: { paymentOrder: { customerId: postgres.customerId } },
        orderBy: { issuedAt: "desc" },
        select: { receiptNumber: true, issuedAt: true },
      });
      return this.verifiedCollection(
        receipts.map((receipt) => ({
          id: `postgres:${receipt.receiptNumber}`,
          reference: receipt.receiptNumber,
          date: receipt.issuedAt.toISOString(),
        })),
      );
    });
  }

  getAffiliateDocuments(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { postgres } = await this.affiliateContext(subjectRef);
      if (!postgres)
        throw new HybridBoundaryError("POSTGRES_CROSSWALK_REQUIRED");
      const contracts = await this.prisma.contract.findMany({
        where: { relatedCustomerId: postgres.customerId },
        orderBy: { createdAt: "desc" },
        select: {
          internalReference: true,
          type: true,
          status: true,
          createdAt: true,
          currentVersion: { select: { createdAt: true } },
        },
      });
      return this.verifiedCollection(
        contracts.map((contract) => ({
          id: `postgres:${contract.internalReference}`,
          title: contract.type,
          documentType: contract.type,
          status: contract.status,
          date: (
            contract.currentVersion?.createdAt ?? contract.createdAt
          ).toISOString(),
        })),
      );
    });
  }

  getAffiliateRequests(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { postgres } = await this.affiliateContext(subjectRef);
      if (!postgres)
        throw new HybridBoundaryError("POSTGRES_CROSSWALK_REQUIRED");
      const requests = await this.prisma.pqrCase.findMany({
        where: { relatedCustomerId: postgres.customerId },
        orderBy: { createdAt: "desc" },
        select: {
          caseNumber: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return this.verifiedCollection(
        requests.map((request) => ({
          id: request.caseNumber,
          reference: request.caseNumber,
          requestType: request.category,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
        })),
      );
    });
  }

  getAffiliateBeneficiaryRules(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_RULES_PLAN_CROSSWALK_NOT_APPROVED"),
    );
  }

  listAffiliateBeneficiaryChangeRequests(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  getAffiliateBeneficiaryChangeRequest(
    _subjectRef: string,
    _requestId: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  createAffiliateBeneficiaryChangeRequest(
    _subjectRef: string,
    _payload: ProviderPayload,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  updateAffiliateBeneficiaryChangeRequest(
    _subjectRef: string,
    _requestId: string,
    _payload: ProviderPayload,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  uploadAffiliateBeneficiaryChangeDocument(
    _subjectRef: string,
    _requestId: string,
    _upload: BeneficiaryDocumentUpload,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  submitAffiliateBeneficiaryChangeRequest(
    _subjectRef: string,
    _requestId: string,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  cancelAffiliateBeneficiaryChangeRequest(
    _subjectRef: string,
    _requestId: string,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("BENEFICIARY_CHANGE_DOMAIN_NOT_CONFIGURED"),
    );
  }

  submitAffiliateContactUpdate(
    _subjectRef: string,
    _input: {
      channel: SelfServiceChannel;
      destination: string;
      verificationReference: string;
    },
    _idempotencyKey: string,
  ): Promise<ProviderResult<ContactUpdateProviderState>> {
    return Promise.resolve(unavailable("MASTER_WRITE_PATH_PROHIBITED"));
  }

  getAffiliateContactUpdate(
    _subjectRef: string,
    _providerReference: string,
  ): Promise<ProviderResult<ContactUpdateProviderState>> {
    return Promise.resolve(
      unavailable("CONTACT_UPDATE_PROVIDER_NOT_CONFIGURED"),
    );
  }

  getCompanySummary(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return this.run(async () => {
      const { subject, company, postgres } =
        await this.companyContext(subjectRef);
      return this.verifiedPayload({
        ...(postgres?.name || company.name
          ? { displayName: postgres?.name ?? company.name }
          : {}),
        nitMasked: maskDocumentNumber(subject.masterNit),
        ...(postgres
          ? { status: postgres.status }
          : company.status
            ? { status: company.status }
            : {}),
      });
    });
  }

  getCompanyBenefits(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(
      unavailable("COMPANY_BENEFIT_ENTITLEMENT_SEMANTICS_NOT_APPROVED"),
    );
  }

  getCompanyContracts(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { subject, postgres } = await this.companyContext(subjectRef);
      const legacyContracts = await this.master.getCompanyContracts(
        subject.masterNit,
      );
      const digitalContracts = postgres
        ? await this.prisma.contract.findMany({
            where: { relatedCompanyId: postgres.id },
            orderBy: { createdAt: "desc" },
            select: {
              internalReference: true,
              type: true,
              status: true,
              effectiveDate: true,
            },
          })
        : [];
      return this.verifiedCollection([
        ...legacyContracts.map((contract) => this.mapLegacyContract(contract)),
        ...digitalContracts.map((contract) => ({
          id: `postgres:${contract.internalReference}`,
          reference: contract.internalReference,
          title: contract.type,
          status: contract.status,
          ...(contract.effectiveDate
            ? { effectiveDate: contract.effectiveDate.toISOString() }
            : {}),
        })),
      ]);
    });
  }

  getCompanyPayments(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { subject } = await this.companyContext(subjectRef);
      const contracts = await this.master.getCompanyContracts(
        subject.masterNit,
      );
      const payments = await this.legacyPayments(contracts);
      return this.verifiedCollection(
        payments.map((payment) => this.mapLegacyPayment(payment)),
      );
    });
  }

  getCompanyDocuments(
    subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return this.run(async () => {
      const { postgres } = await this.companyContext(subjectRef);
      if (!postgres)
        throw new HybridBoundaryError("POSTGRES_CROSSWALK_REQUIRED");
      const contracts = await this.prisma.contract.findMany({
        where: { relatedCompanyId: postgres.id },
        orderBy: { createdAt: "desc" },
        select: {
          internalReference: true,
          type: true,
          status: true,
          createdAt: true,
          currentVersion: { select: { createdAt: true } },
        },
      });
      return this.verifiedCollection(
        contracts.map((contract) => ({
          id: `postgres:${contract.internalReference}`,
          title: contract.type,
          documentType: contract.type,
          status: contract.status,
          date: (
            contract.currentVersion?.createdAt ?? contract.createdAt
          ).toISOString(),
        })),
      );
    });
  }

  getCompanyRequests(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(
      unavailable("COMPANY_REQUEST_CROSSWALK_NOT_AVAILABLE"),
    );
  }

  getCompanyReports(
    _subjectRef: string,
  ): Promise<ProviderResult<ProviderCollection>> {
    return Promise.resolve(unavailable("COMPANY_REPORT_DOMAIN_NOT_CONFIGURED"));
  }

  quotePayment(
    _subjectRef: string,
    _payload: ProviderPayload,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("SELF_SERVICE_PAYMENT_QUOTE_SEMANTICS_NOT_APPROVED"),
    );
  }

  applyConfirmedPayment(
    _subjectRef: string,
    _payload: ProviderPayload,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("SELF_SERVICE_PAYMENT_APPLICATION_NOT_CONFIGURED"),
    );
  }

  getPaymentApplication(
    _subjectRef: string,
    _applicationId: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("SELF_SERVICE_PAYMENT_APPLICATION_NOT_CONFIGURED"),
    );
  }

  reversePayment(
    _subjectRef: string,
    _payload: ProviderPayload,
    _idempotencyKey: string,
  ): Promise<ProviderResult<ProviderPayload>> {
    return Promise.resolve(
      unavailable("SELF_SERVICE_PAYMENT_REVERSAL_NOT_CONFIGURED"),
    );
  }

  private async affiliateContext(subjectRef: string): Promise<{
    subject: AffiliateSubject;
    person: Person;
    postgres: {
      customerId: string;
      affiliateId: string;
      fullName: string;
      affiliateStatus: AffiliateStatus;
    } | null;
  }> {
    const subject = this.decodeSubject(subjectRef, "AFFILIATE");
    const person = await this.master.findPersonByDocument(
      subject.documentNumber,
    );
    if (
      !person ||
      person.personId !== subject.masterPersonId ||
      person.document !== subject.documentNumber ||
      person.documentType !== subject.documentType
    ) {
      throw new HybridBoundaryError("MASTER_SUBJECT_CROSSWALK_INVALID");
    }
    if (!subject.postgresCustomerId && !subject.postgresAffiliateId)
      return { subject, person, postgres: null };
    if (!subject.postgresCustomerId || !subject.postgresAffiliateId) {
      throw new HybridBoundaryError("POSTGRES_SUBJECT_CROSSWALK_INVALID");
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: subject.postgresCustomerId },
      select: {
        id: true,
        documentType: true,
        documentNumber: true,
        fullName: true,
        affiliates: {
          where: { id: subject.postgresAffiliateId },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });
    const affiliate = customer?.affiliates[0];
    if (
      !customer ||
      !affiliate ||
      customer.documentType !== subject.documentType ||
      customer.documentNumber !== subject.documentNumber
    ) {
      throw new HybridBoundaryError("POSTGRES_SUBJECT_CROSSWALK_INVALID");
    }
    return {
      subject,
      person,
      postgres: {
        customerId: customer.id,
        affiliateId: affiliate.id,
        fullName: customer.fullName,
        affiliateStatus: affiliate.status,
      },
    };
  }

  private async companyContext(subjectRef: string): Promise<{
    subject: CompanySubject;
    company: MasterCompany;
    postgres: { id: string; name: string; status: CompanyStatus } | null;
  }> {
    const subject = this.decodeSubject(subjectRef, "COMPANY");
    const company = await this.master.findCompanyByNit(subject.masterNit);
    if (!company || company.nit !== subject.masterNit) {
      throw new HybridBoundaryError("MASTER_SUBJECT_CROSSWALK_INVALID");
    }
    if (!subject.postgresCompanyId) return { subject, company, postgres: null };
    const postgres = await this.prisma.company.findUnique({
      where: { id: subject.postgresCompanyId },
      select: { id: true, nit: true, name: true, status: true },
    });
    if (!postgres || postgres.nit !== subject.masterNit) {
      throw new HybridBoundaryError("POSTGRES_SUBJECT_CROSSWALK_INVALID");
    }
    return { subject, company, postgres };
  }

  private async legacyPayments(
    contracts: readonly MasterContract[],
  ): Promise<readonly MasterPayment[]> {
    const payments: MasterPayment[] = [];
    for (const contract of contracts) {
      payments.push(
        ...(await this.master.getPaymentHistory(contract.contractId)),
      );
    }
    return payments;
  }

  private mapLegacyPayment(payment: MasterPayment): ProviderPayload {
    return {
      id: `master:${payment.contractId}:${payment.receiptNumber}`,
      reference: payment.receiptNumber,
      ...(payment.amount !== null ? { amount: payment.amount } : {}),
      ...(payment.annulled === true ? { status: "ANNULLED" } : {}),
      ...(payment.paidAt ? { date: payment.paidAt } : {}),
    };
  }

  private mapLegacyContract(contract: MasterContract): ProviderPayload {
    return {
      id: `master:${contract.contractId}`,
      reference: contract.contractId,
      ...(contract.legacyStatus ? { status: contract.legacyStatus } : {}),
      ...(contract.validFrom ? { effectiveDate: contract.validFrom } : {}),
    };
  }

  private encodeSubject(subject: HybridSubject): string {
    return (
      SUBJECT_PREFIX +
      Buffer.from(JSON.stringify(subject), "utf8").toString("base64url")
    );
  }

  private decodeSubject(
    subjectRef: string,
    expectedPortal: "AFFILIATE",
  ): AffiliateSubject;
  private decodeSubject(
    subjectRef: string,
    expectedPortal: "COMPANY",
  ): CompanySubject;
  private decodeSubject(
    subjectRef: string,
    expectedPortal: HybridSubject["portal"],
  ): HybridSubject {
    if (!subjectRef.startsWith(SUBJECT_PREFIX) || subjectRef.length > 1_024) {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    const encoded = subjectRef.slice(SUBJECT_PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    let value: unknown;
    try {
      const decoded = Buffer.from(encoded, "base64url");
      if (decoded.toString("base64url") !== encoded) {
        throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
      }
      value = JSON.parse(decoded.toString("utf8"));
    } catch {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    const candidate = value as Partial<HybridSubject> & Record<string, unknown>;
    if (candidate.version !== 1 || candidate.portal !== expectedPortal) {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    if (expectedPortal === "AFFILIATE") {
      if (
        !this.hasOnlyKeys(candidate, [
          "version",
          "portal",
          "masterPersonId",
          "documentNumber",
          "documentType",
          "postgresCustomerId",
          "postgresAffiliateId",
        ])
      ) {
        throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
      }
      if (
        typeof candidate.masterPersonId !== "string" ||
        !this.safeMasterIdentifier(candidate.masterPersonId) ||
        typeof candidate.documentNumber !== "string" ||
        !this.safeMasterIdentifier(candidate.documentNumber) ||
        typeof candidate.documentType !== "string" ||
        !/^[A-Z]{2,3}$/.test(candidate.documentType) ||
        !this.optionalUuid(candidate.postgresCustomerId) ||
        !this.optionalUuid(candidate.postgresAffiliateId)
      ) {
        throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
      }
      return candidate as AffiliateSubject;
    }
    if (
      !this.hasOnlyKeys(candidate, [
        "version",
        "portal",
        "masterNit",
        "postgresCompanyId",
      ])
    ) {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    if (
      typeof candidate.masterNit !== "string" ||
      !this.safeMasterIdentifier(candidate.masterNit) ||
      !this.optionalUuid(candidate.postgresCompanyId)
    ) {
      throw new HybridBoundaryError("INVALID_SUBJECT_REFERENCE");
    }
    return candidate as CompanySubject;
  }

  private optionalUuid(value: unknown): boolean {
    return (
      value === undefined ||
      (typeof value === "string" && UUID_PATTERN.test(value))
    );
  }

  private safeMasterIdentifier(value: string): boolean {
    if (value.length < 1 || value.length > 64) return false;
    return [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    });
  }

  private hasOnlyKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
  ): boolean {
    const allowedKeys = new Set(allowed);
    return Object.keys(value).every((key) => allowedKeys.has(key));
  }

  private verifiedPayload(
    data: ProviderPayload,
  ): ProviderResult<ProviderPayload> {
    return { status: "VERIFIED", data };
  }

  private verifiedCollection(
    data: ProviderCollection,
  ): ProviderResult<ProviderCollection> {
    return { status: "VERIFIED", data };
  }

  private centsToDecimal(cents: number): string {
    const sign = cents < 0 ? "-" : "";
    const absolute = Math.abs(cents);
    return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
  }

  private async run<T>(
    operation: () => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T>> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof MasterDomainError)
        return unavailable(error.code, error.retryable);
      if (error instanceof HybridBoundaryError)
        return unavailable(error.code, error.retryable);
      return unavailable("HYBRID_PROVIDER_UNAVAILABLE", true);
    }
  }

  private lookupFailure(error: unknown): LookupProviderResult {
    if (error instanceof MasterDomainError)
      return lookupUnavailable(error.code, error.retryable);
    if (error instanceof HybridBoundaryError)
      return lookupUnavailable(error.code, error.retryable);
    return lookupUnavailable("HYBRID_PROVIDER_UNAVAILABLE", true);
  }
}
