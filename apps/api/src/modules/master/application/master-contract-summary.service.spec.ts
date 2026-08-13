import { NotFoundException } from "@nestjs/common";
import type { Contract, ContractStatus, Installment, Payment, Plan } from "../domain/master.models";
import type { MasterQueryService } from "./master-query.service";
import { MasterContractSummaryService } from "./master-contract-summary.service";

describe("MasterContractSummaryService", () => {
  const contract: Contract = {
    contractId: "1001",
    personId: "500",
    createdAt: null,
    validFrom: null,
    validUntil: null,
    value: "100000",
    initialValue: "100000",
    installmentCount: 10,
    legacyStatus: "ACTIVO",
    planId: "20",
    paidThrough: null,
    balance: "50000",
    installments: 10,
    paymentFrequencyAmount: "10000",
    companyNit: null,
    monthsInArrears: 0,
    daysInArrears: 0,
    lastPaymentAt: null,
    lastPaymentAmount: null,
    paymentMethodId: null,
    paymentModalityId: null,
  };

  const plan: Plan = {
    planId: "20",
    name: null,
    planTypeId: null,
    planType: null,
    status: null,
  };

  const installment: Installment = {
    installmentId: "1",
    contractId: "1001",
    renewalId: null,
    dueDate: null,
    installmentNumber: 1,
    value: "10000",
    tax: null,
    amountPaid: "10000",
    balance: "0",
    companyContribution: null,
    workerContribution: null,
    agreement: null,
    legacyStatus: null,
    agreementDate: null,
    observation: null,
  };

  const payment: Payment = {
    contractId: "1001",
    paidAt: null,
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

  const status: ContractStatus = {
    contractId: "1001",
    legacyStatus: "ACTIVO",
    validFrom: null,
    validUntil: null,
    paidThrough: null,
    balance: "50000",
    withdrawalDate: null,
    derivedStatus: null,
  };

  function makeQueryService() {
    return {
      getContract: jest.fn().mockResolvedValue(contract),
      getPlan: jest.fn().mockResolvedValue(plan),
      getContractInstallments: jest.fn().mockResolvedValue([installment]),
      getPaymentHistory: jest.fn().mockResolvedValue([payment]),
      getContractStatus: jest.fn().mockResolvedValue(status),
    } as unknown as jest.Mocked<MasterQueryService>;
  }

  it("builds a read-only summary from approved master queries", async () => {
    const query = makeQueryService();
    const service = new MasterContractSummaryService(query);

    await expect(service.getSummary("1001")).resolves.toEqual({
      contract,
      plan,
      installments: [installment],
      payments: [payment],
      status,
    });

    expect(query.getContract).toHaveBeenCalledWith("1001");
    expect(query.getPlan).toHaveBeenCalledWith("20");
    expect(query.getContractInstallments).toHaveBeenCalledWith("1001");
    expect(query.getPaymentHistory).toHaveBeenCalledWith("1001");
    expect(query.getContractStatus).toHaveBeenCalledWith("1001");
  });

  it("returns 404 when the master contract does not exist", async () => {
    const query = makeQueryService();
    query.getContract.mockResolvedValue(null);

    const service = new MasterContractSummaryService(query);

    await expect(service.getSummary("999999")).rejects.toBeInstanceOf(NotFoundException);

    expect(query.getPlan).not.toHaveBeenCalled();
    expect(query.getContractInstallments).not.toHaveBeenCalled();
    expect(query.getPaymentHistory).not.toHaveBeenCalled();
    expect(query.getContractStatus).not.toHaveBeenCalled();
  });

  it("does not query a plan when the contract has no planId", async () => {
    const query = makeQueryService();
    query.getContract.mockResolvedValue({ ...contract, planId: null });

    const service = new MasterContractSummaryService(query);
    const result = await service.getSummary("1001");

    expect(result.plan).toBeNull();
    expect(query.getPlan).not.toHaveBeenCalled();
    expect(query.getContractInstallments).toHaveBeenCalledWith("1001");
    expect(query.getPaymentHistory).toHaveBeenCalledWith("1001");
    expect(query.getContractStatus).toHaveBeenCalledWith("1001");
  });
});
