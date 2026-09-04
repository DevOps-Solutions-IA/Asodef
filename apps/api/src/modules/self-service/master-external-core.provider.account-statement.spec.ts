import { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
import type { MasterQueryService } from "../master/application/master-query.service";
import type { Contract, Installment } from "../master/domain/master.models";
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
  contractId: "100",
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
  balance: "12500",
  installments: 12,
  paymentFrequencyAmount: "5000",
  companyNit: null,
  monthsInArrears: null,
  daysInArrears: null,
  lastPaymentAt: null,
  lastPaymentAmount: null,
  paymentMethodId: null,
  paymentModalityId: null,
};

function installment(overrides: Partial<Installment>): Installment {
  return {
    installmentId: "I-1",
    contractId: contract.contractId,
    renewalId: null,
    dueDate: "2020-01-01",
    installmentNumber: 1,
    value: "7500",
    tax: "0",
    amountPaid: "0",
    balance: "7500",
    companyContribution: null,
    workerContribution: null,
    agreement: null,
    legacyStatus: "P",
    agreementDate: null,
    observation: null,
    ...overrides,
  };
}

describe("MasterExternalCoreProvider account statement", () => {
  it("consolidates overdue + current balances from the certified payable set", async () => {
    const master = masterMock();
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getOutstandingInstallments.mockResolvedValue([
      installment({ installmentId: "I-OVERDUE", dueDate: "2020-01-01", installmentNumber: 1, balance: "7500" }),
      installment({ installmentId: "I-CURRENT", dueDate: "2999-01-01", installmentNumber: 2, balance: "5000" }),
    ]);
    const provider = providerFor(master);

    await expect(provider.getAffiliateAccountStatement(contract.personId!)).resolves.toEqual({
      status: "VERIFIED",
      data: {
        status: "EN_MORA",
        balance: "12500",
        currency: "COP",
        overdueBalance: "7500",
        currentBalance: "5000",
        overdueCount: 1,
        currentCount: 1,
        contractCount: 1,
      },
    });
  });

  it("returns an explicit zero balance when the affiliate has no payable installments", async () => {
    const master = masterMock();
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getOutstandingInstallments.mockResolvedValue([]);
    const provider = providerFor(master);

    await expect(provider.getAffiliateAccountStatement(contract.personId!)).resolves.toEqual({
      status: "VERIFIED",
      data: {
        status: "AL_DIA",
        balance: "0",
        currency: "COP",
        overdueBalance: "0",
        currentBalance: "0",
        overdueCount: 0,
        currentCount: 0,
        contractCount: 1,
      },
    });
  });

  it("fails closed instead of rounding an invalid Master financial value", async () => {
    const master = masterMock();
    master.getContractsByPerson.mockResolvedValue([contract]);
    master.getOutstandingInstallments.mockResolvedValue([
      installment({ balance: "100.001", dueDate: "2020-01-01" }),
    ]);
    const provider = providerFor(master);

    await expect(provider.getAffiliateAccountStatement(contract.personId!)).resolves.toEqual(
      expect.objectContaining({
        status: "UNAVAILABLE",
        error: expect.objectContaining({ code: "MASTER_ACCOUNT_STATEMENT_INVALID", retryable: false }),
      }),
    );
  });
});
