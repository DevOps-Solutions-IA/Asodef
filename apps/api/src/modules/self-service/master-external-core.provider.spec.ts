import type { MasterQueryService } from "../master/application/master-query.service";
import type { Contract, Payment, Person } from "../master/domain/master.models";
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

describe("MasterExternalCoreProvider", () => {
  it("resolves an affiliate document through the Master read service", async () => {
    const master = masterMock();
    master.findPersonByDocument.mockResolvedValue(person);
    const provider = new MasterExternalCoreProvider(master);

    await expect(provider.startAffiliateLookup({ identifierMode: "DOCUMENT", documentType: "CC", identifier: person.document! }))
      .resolves.toEqual({ status: "VERIFIED", data: { subjectRef: person.personId } });
  });

  it("resolves a company NIT through the Master read service", async () => {
    const master = masterMock();
    master.findCompanyByNit.mockResolvedValue({ nit: "900123456", name: "EMPRESA", status: "ACTIVA" });
    const provider = new MasterExternalCoreProvider(master);

    await expect(provider.startCompanyLookupByNit({ nit: "900123456" }))
      .resolves.toEqual({ status: "VERIFIED", data: { subjectRef: "900123456" } });
  });

  it("fails closed instead of treating legacy contact presence as OTP consent", async () => {
    const provider = new MasterExternalCoreProvider(masterMock());

    const channels = await provider.getAffiliateVerificationChannels(person.personId);
    expect(channels.status).toBe("NOT_CONFIGURED");
    expect(channels).not.toHaveProperty("data");
  });

  it("exposes read-only payment history but not an invented payable obligation", async () => {
    const master = masterMock();
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getPaymentHistory.mockResolvedValue([payment]);
    const provider = new MasterExternalCoreProvider(master);

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

    await expect(provider.getAffiliateObligations(person.personId)).resolves.toEqual(
      expect.objectContaining({ status: "NOT_CONFIGURED" }),
    );
    await expect(provider.applyConfirmedPayment()).resolves.toEqual(
      expect.objectContaining({ status: "NOT_CONFIGURED", error: expect.objectContaining({ code: "MASTER_WRITE_DISABLED" }) }),
    );
  });
});
