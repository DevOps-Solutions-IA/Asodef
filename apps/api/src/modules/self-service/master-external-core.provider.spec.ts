import { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
import type { MasterQueryService } from "../master/application/master-query.service";
import type { Contract, Installment, Payment, Person } from "../master/domain/master.models";
import { MasterExternalCoreProvider } from "./master-external-core.provider";

function masterMock() {
  return {
    findPersonByDocument: jest.fn(),
    findCompanyByNit: jest.fn(),
    getContract: jest.fn(),
    getContractsByPerson: jest.fn(),
    getCompanyContracts: jest.fn(),
    getPlan: jest.fn(),
    getContractInstallments: jest.fn(),
    getOutstandingInstallments: jest.fn(),
    getPaymentHistory: jest.fn(),
    getPaymentReceipt: jest.fn(),
    getContractBeneficiaries: jest.fn(),
    getContractStatus: jest.fn(),
  } as unknown as jest.Mocked<MasterQueryService>;
}

function providerFor(master: MasterQueryService): MasterExternalCoreProvider {
  return new MasterExternalCoreProvider(master, new MasterPaymentQuoteService(master));
}

const person: Person = {
  personId: "123456789",
  document: "123456789",
  documentType: "CC",
  names: "ANA",
  surnames: "PEREZ",
  phone: "3000000000",
  whatsapp: "3000000000",
  address: null,
  affiliationDate: "2025-01-01T00:00:00.000Z",
  withdrawalDate: null,
  withdrawn: false,
  relationship: null,
  contractId: "100",
  planId: "10",
};

const contract: Contract = {
  contractId: "100",
  personId: person.personId,
  createdAt: "2025-01-01T00:00:00.000Z",
  validFrom: "2025-01-01T00:00:00.000Z",
  validUntil: null,
  value: "100000",
  initialValue: "100000",
  installmentCount: 12,
  legacyStatus: "ACTIVO",
  planId: "10",
  paidThrough: null,
  balance: "50000",
  installments: 12,
  paymentFrequencyAmount: "10000",
  companyNit: null,
  monthsInArrears: null,
  daysInArrears: null,
  lastPaymentAt: "2026-08-01T00:00:00.000Z",
  lastPaymentAmount: "10000",
  paymentMethodId: null,
  paymentModalityId: null,
};

const payment: Payment = {
  contractId: "100",
  paidAt: "2026-08-01T00:00:00.000Z",
  amount: "10000",
  receiptNumber: "R-1",
  periodFrom: null,
  periodUntil: null,
  detail: null,
  collectorId: null,
  annulled: false,
  operator: null,
  balance: "50000",
  paymentType: null,
  discount: null,
  document: null,
  documentType: null,
  cashRegisterId: null,
  prefix: null,
};

const payableInstallment: Installment = {
  installmentId: "I-1",
  contractId: "100",
  renewalId: null,
  dueDate: "2026-08-15",
  installmentNumber: 8,
  value: "20000",
  tax: "0",
  amountPaid: "12500",
  balance: "7500",
  companyContribution: null,
  workerContribution: null,
  agreement: null,
  legacyStatus: "P",
  agreementDate: null,
  observation: null,
};

describe("MasterExternalCoreProvider", () => {
  it("resolves an affiliate document through the Master read service", async () => {
    const master = masterMock();
    master.findPersonByDocument.mockResolvedValue(person);
    const provider = providerFor(master);

    await expect(provider.startAffiliateLookup({ identifierMode: "DOCUMENT", documentType: "CC", identifier: person.document! }))
      .resolves.toEqual({ status: "VERIFIED", data: { subjectRef: person.personId } });
  });

  it("resolves a company NIT through the Master read service", async () => {
    const master = masterMock();
    master.findCompanyByNit.mockResolvedValue({
      nit: "900123456",
      name: "EMPRESA",
      status: "ACTIVA",
      contactMobile: null,
      contactPhone: null,
      phone2: "315 111 2233",
      phone: "602 555 0101",
    });
    const provider = providerFor(master);

    await expect(provider.startCompanyLookupByNit({ nit: "900123456" }))
      .resolves.toEqual({ status: "VERIFIED", data: { subjectRef: "900123456" } });
  });

  it("uses approved legacy phone/WhatsApp mobile fields as deduplicated WhatsApp OTP destinations", async () => {
    const master = masterMock();
    master.findPersonByDocument.mockResolvedValue(person);
    const provider = providerFor(master);

    await expect(provider.getAffiliateVerificationChannels(person.personId)).resolves.toEqual({
      status: "VERIFIED",
      data: [{
        id: "legacy-whatsapp",
        type: "whatsapp",
        masked: "+57 *** *** 0000",
        enabled: true,
        verified: true,
        operationalCommunicationPermission: true,
      }],
    });

    await expect(provider.getAffiliateContactDestinations(person.personId)).resolves.toEqual({
      status: "VERIFIED",
      data: [{
        id: "legacy-whatsapp",
        type: "whatsapp",
        destination: "573000000000",
        enabled: true,
        verified: true,
        operationalCommunicationPermission: true,
      }],
    });
  });

  it("uses the first valid company mobile in approved priority order for WhatsApp OTP", async () => {
    const master = masterMock();
    master.findCompanyByNit.mockResolvedValue({
      nit: "900123456",
      name: "EMPRESA",
      status: "ACTIVA",
      contactMobile: null,
      contactPhone: null,
      phone2: "315 111 2233",
      phone: "300 999 8877",
    });
    const provider = providerFor(master);

    await expect(provider.getCompanyVerificationChannels("900123456")).resolves.toEqual({
      status: "VERIFIED",
      data: [
        expect.objectContaining({
          id: "company-phone-2",
          type: "whatsapp",
          masked: "+57 *** *** 2233",
        }),
        expect.objectContaining({
          id: "company-phone",
          type: "whatsapp",
          masked: "+57 *** *** 8877",
        }),
      ],
    });
  });

  it("returns no WhatsApp channel instead of inventing one when a company has no valid mobile", async () => {
    const master = masterMock();
    master.findCompanyByNit.mockResolvedValue({
      nit: "900000000",
      name: "SIN CELULAR",
      status: "ACTIVA",
      contactMobile: null,
      contactPhone: null,
      phone2: null,
      phone: "6025550101",
    });
    const provider = providerFor(master);

    await expect(provider.getCompanyContactDestinations("900000000")).resolves.toEqual({
      status: "VERIFIED",
      data: [],
    });
  });

  it("exposes affiliate contracts, payment history and the approved payable installment balance", async () => {
    const master = masterMock();
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getPaymentHistory.mockResolvedValue([payment]);
    master.getOutstandingInstallments.mockResolvedValue([payableInstallment]);
    const provider = providerFor(master);

    await expect(provider.getAffiliateContracts(person.personId)).resolves.toEqual({
      status: "VERIFIED",
      data: [{
        id: "100",
        reference: "100",
        title: "Plan 10",
        status: "ACTIVO",
        effectiveDate: "2025-01-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      }],
    });

    await expect(provider.getAffiliatePayments(person.personId)).resolves.toEqual({
      status: "VERIFIED",
      data: [
        expect.objectContaining({
          reference: "R-1",
          amount: "10000",
          currency: "COP",
          status: "REGISTRADO",
        }),
      ],
    });

    await expect(provider.getAffiliateObligations(person.personId)).resolves.toEqual({
      status: "VERIFIED",
      data: [{
        id: "I-1",
        reference: "100",
        label: "Cuota 8",
        amount: "7500",
        currency: "COP",
        status: "OVERDUE",
        dueDate: "2026-08-15",
      }],
    });
  });

  it("quotes a certified payable installment through the shared quote authority", async () => {
    const master = masterMock();
    master.findPersonByDocument.mockResolvedValue(person);
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getOutstandingInstallments.mockResolvedValue([payableInstallment]);
    const provider = providerFor(master);

    await expect(provider.quotePayment(person.personId, {
      contractId: contract.contractId,
      installmentId: payableInstallment.installmentId,
      amountCents: 1,
    })).resolves.toEqual({
      status: "VERIFIED",
      data: {
        id: "I-1",
        reference: "100",
        label: "Cuota 8",
        amount: "7500",
        amountCents: 750000,
        currency: "COP",
        status: "OVERDUE",
        dueDate: "2026-08-15",
      },
    });
  });

  it("refuses a payment quote when the contract is not owned by the authenticated subject", async () => {
    const master = masterMock();
    master.findPersonByDocument.mockResolvedValue(person);
    master.getContractsByPerson.mockResolvedValue([]);
    const provider = providerFor(master);

    await expect(provider.quotePayment(person.personId, {
      contractId: contract.contractId,
      installmentId: payableInstallment.installmentId,
    })).resolves.toEqual(expect.objectContaining({
      status: "UNAVAILABLE",
      error: expect.objectContaining({ code: "MASTER_PAYMENT_SELECTION_INVALID", retryable: false }),
    }));
    expect(master.getOutstandingInstallments).not.toHaveBeenCalled();
  });

  it("refuses a payment quote when the selected installment is no longer payable", async () => {
    const master = masterMock();
    master.findPersonByDocument.mockResolvedValue(person);
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getOutstandingInstallments.mockResolvedValue([]);
    const provider = providerFor(master);

    await expect(provider.quotePayment(person.personId, {
      contractId: contract.contractId,
      installmentId: payableInstallment.installmentId,
    })).resolves.toEqual(expect.objectContaining({
      status: "UNAVAILABLE",
      error: expect.objectContaining({ code: "MASTER_PAYMENT_NOT_PAYABLE", retryable: false }),
    }));
  });

  it("never enables Master payment application or reversal writes", async () => {
    const master = masterMock();
    const provider = providerFor(master);

    await expect(provider.applyConfirmedPayment()).resolves.toEqual(
      expect.objectContaining({ status: "NOT_CONFIGURED", error: expect.objectContaining({ code: "MASTER_WRITE_DISABLED" }) }),
    );
    await expect(provider.reversePayment()).resolves.toEqual(
      expect.objectContaining({ status: "NOT_CONFIGURED", error: expect.objectContaining({ code: "MASTER_WRITE_DISABLED" }) }),
    );
  });
});
