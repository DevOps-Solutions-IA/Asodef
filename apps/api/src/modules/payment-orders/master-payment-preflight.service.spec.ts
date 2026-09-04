import { describe, expect, it, vi } from "vitest";
import type { MasterQueryService } from "../master/application/master-query.service";
import type { Contract, Installment, Person } from "../master/domain/master.models";
import type { MasterPaymentSelectionTokenService } from "./master-payment-selection-token.service";
import { MasterPaymentPreflightService } from "./master-payment-preflight.service";

const person: Person = {
  personId: "1012345678",
  document: "1012345678",
  documentType: "CC",
  names: "Ana",
  surnames: "Pérez",
  phone: null,
  whatsapp: null,
  address: null,
  affiliationDate: null,
  withdrawalDate: null,
  withdrawn: false,
  relationship: null,
  contractId: "900001",
  planId: "7",
};

const contract: Contract = {
  contractId: "900001",
  personId: person.personId,
  createdAt: null,
  validFrom: null,
  validUntil: null,
  value: null,
  initialValue: null,
  installmentCount: 12,
  legacyStatus: "ACTIVO",
  planId: "7",
  paidThrough: null,
  balance: "150000.00",
  installments: 12,
  paymentFrequencyAmount: "50000.00",
  companyNit: null,
  monthsInArrears: 1,
  daysInArrears: 10,
  lastPaymentAt: null,
  lastPaymentAmount: null,
  paymentMethodId: null,
  paymentModalityId: null,
};

const installment: Installment = {
  installmentId: "42",
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

function harness(options?: { tokenValid?: boolean; contracts?: Contract[]; installments?: Installment[] }) {
  const selection = { personId: person.personId, contractId: contract.contractId, installmentId: installment.installmentId };
  const tokens = {
    verify: vi.fn(() => options?.tokenValid === false ? null : selection),
  } as unknown as MasterPaymentSelectionTokenService;
  const master = {
    findPersonByDocument: vi.fn(async () => person),
    getContractsByPerson: vi.fn(async () => options?.contracts ?? [contract]),
    getOutstandingInstallments: vi.fn(async () => options?.installments ?? [installment]),
  } as unknown as MasterQueryService;
  return { service: new MasterPaymentPreflightService(master, tokens), master, tokens };
}

describe("MasterPaymentPreflightService", () => {
  it("re-reads Master and returns the current payable amount", async () => {
    const { service } = harness();

    await expect(service.verify("master.v1.opaque")).resolves.toEqual({
      personId: person.personId,
      document: person.document,
      documentType: "CC",
      fullName: "Ana Pérez",
      contractId: contract.contractId,
      installmentId: installment.installmentId,
      concept: "Cuota 8",
      amountCents: 5_000_000,
      currency: "COP",
      dueDate: new Date("2026-09-10T12:00:00.000Z"),
      status: expect.any(String),
    });
  });

  it("does not query Master for an invalid or expired selector", async () => {
    const { service, master } = harness({ tokenValid: false });

    await expect(service.verify("tampered")).resolves.toBeNull();
    expect(master.findPersonByDocument).not.toHaveBeenCalled();
  });

  it("fails closed when the selected contract does not belong to the person", async () => {
    const { service, master } = harness({ contracts: [] });

    await expect(service.verify("master.v1.opaque")).resolves.toBeNull();
    expect(master.getOutstandingInstallments).not.toHaveBeenCalled();
  });

  it("fails closed when the installment is no longer outstanding", async () => {
    const { service } = harness({ installments: [] });

    await expect(service.verify("master.v1.opaque")).resolves.toBeNull();
  });
});
