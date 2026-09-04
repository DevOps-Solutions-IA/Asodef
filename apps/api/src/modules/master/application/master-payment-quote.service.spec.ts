import type { MasterQueryService } from "./master-query.service";
import type { Contract, Installment, Person } from "../domain/master.models";
import { MasterPaymentQuoteService } from "./master-payment-quote.service";

const person: Person = {
  personId: "123456789",
  document: "123456789",
  documentType: "CC",
  names: "ANA",
  surnames: "PEREZ",
  phone: null,
  whatsapp: null,
  address: null,
  affiliationDate: null,
  withdrawalDate: null,
  withdrawn: false,
  relationship: null,
  contractId: "100",
  planId: "10",
};

const contract: Contract = {
  contractId: "100",
  personId: person.personId,
  createdAt: null,
  validFrom: null,
  validUntil: null,
  value: null,
  initialValue: null,
  installmentCount: null,
  legacyStatus: "ACTIVO",
  planId: "10",
  paidThrough: null,
  balance: null,
  installments: null,
  paymentFrequencyAmount: null,
  companyNit: null,
  monthsInArrears: null,
  daysInArrears: null,
  lastPaymentAt: null,
  lastPaymentAmount: null,
  paymentMethodId: null,
  paymentModalityId: null,
};

const installment: Installment = {
  installmentId: "I-1",
  contractId: contract.contractId,
  renewalId: null,
  dueDate: "2026-09-10",
  installmentNumber: 8,
  value: "50000.00",
  tax: null,
  amountPaid: "0.00",
  balance: "50000.00",
  companyContribution: null,
  workerContribution: null,
  agreement: null,
  legacyStatus: null,
  agreementDate: null,
  observation: null,
};

function harness() {
  const master = {
    findPersonByDocument: jest.fn(async () => person),
    getContractsByPerson: jest.fn(async () => [contract]),
    getOutstandingInstallments: jest.fn(async () => [installment]),
  } as unknown as jest.Mocked<MasterQueryService>;
  return { master, service: new MasterPaymentQuoteService(master) };
}

describe("MasterPaymentQuoteService", () => {
  it("returns a verified, exact-cent quote for the currently payable installment", async () => {
    const { service } = harness();

    await expect(service.quote(person.personId, contract.contractId, installment.installmentId)).resolves.toEqual({
      status: "VERIFIED",
      data: {
        person,
        contract,
        installment,
        amountCents: 5_000_000,
        dueDate: new Date("2026-09-10T12:00:00.000Z"),
      },
    });
  });

  it("distinguishes business rejection from infrastructure errors", async () => {
    const { service, master } = harness();
    master.getContractsByPerson.mockResolvedValue([]);

    await expect(service.quote(person.personId, contract.contractId, installment.installmentId)).resolves.toEqual({
      status: "REJECTED",
      reason: "CONTRACT_NOT_OWNED",
    });
  });

  it("fails closed when the selected installment is no longer in the certified payable set", async () => {
    const { service, master } = harness();
    master.getOutstandingInstallments.mockResolvedValue([]);

    await expect(service.quote(person.personId, contract.contractId, installment.installmentId)).resolves.toEqual({
      status: "REJECTED",
      reason: "INSTALLMENT_NOT_PAYABLE",
    });
  });

  it("rejects a Master balance that cannot be represented exactly as COP cents", async () => {
    const { service, master } = harness();
    master.getOutstandingInstallments.mockResolvedValue([{ ...installment, balance: "1.234" }]);

    await expect(service.quote(person.personId, contract.contractId, installment.installmentId)).resolves.toEqual({
      status: "REJECTED",
      reason: "INVALID_FINANCIAL_VALUE",
    });
  });

  it("does not turn a repository outage into a business rejection", async () => {
    const { service, master } = harness();
    master.getContractsByPerson.mockRejectedValue(new Error("offline"));

    await expect(service.quote(person.personId, contract.contractId, installment.installmentId)).rejects.toThrow("offline");
  });
});
