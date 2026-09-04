import { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
import type { MasterQueryService } from "../master/application/master-query.service";
import type { Contract, Payment } from "../master/domain/master.models";
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

const contract: Contract = {
  contractId: "C-900",
  personId: "123456789",
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
  companyNit: "900123456",
  monthsInArrears: null,
  daysInArrears: null,
  lastPaymentAt: "2026-08-01T00:00:00.000Z",
  lastPaymentAmount: "10000",
  paymentMethodId: null,
  paymentModalityId: null,
};

const payment: Payment = {
  contractId: contract.contractId,
  paidAt: "2026-08-01T00:00:00.000Z",
  amount: "10000",
  receiptNumber: "R-COMPANY-1",
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

describe("MasterExternalCoreProvider company read surface", () => {
  it("exposes company status, contracts and payment history from Master", async () => {
    const master = masterMock();
    master.findCompanyByNit.mockResolvedValue({
      nit: "900123456",
      name: "EMPRESA ASODEF PRUEBA",
      status: "ACTIVA",
      contactMobile: "3151112233",
      contactPhone: null,
      phone2: null,
      phone: null,
    });
    master.getCompanyContracts.mockResolvedValue([contract]);
    master.getPaymentHistory.mockResolvedValue([payment]);
    const provider = providerFor(master);

    await expect(provider.getCompanySummary("900123456")).resolves.toEqual({
      status: "VERIFIED",
      data: {
        displayName: "EMPRESA ASODEF PRUEBA",
        status: "ACTIVA",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    });

    await expect(provider.getCompanyContracts("900123456")).resolves.toEqual({
      status: "VERIFIED",
      data: [{
        id: "C-900",
        reference: "C-900",
        title: "Plan 10",
        status: "ACTIVO",
        effectiveDate: "2025-01-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      }],
    });

    await expect(provider.getCompanyPayments("900123456")).resolves.toEqual({
      status: "VERIFIED",
      data: [{
        id: "R-COMPANY-1",
        reference: "R-COMPANY-1",
        amount: "10000",
        currency: "COP",
        status: "REGISTRADO",
        date: "2026-08-01T00:00:00.000Z",
      }],
    });
  });
});
