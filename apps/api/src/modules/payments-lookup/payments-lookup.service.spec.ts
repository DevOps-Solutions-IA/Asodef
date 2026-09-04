import { NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { MasterQueryService } from "../master/application/master-query.service";
import type { Contract, Installment, Person } from "../master/domain/master.models";
import { PaymentsLookupService } from "./payments-lookup.service";

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
  lastPaymentAt: null,
  lastPaymentAmount: null,
  paymentMethodId: null,
  paymentModalityId: null,
};

const installment: Installment = {
  installmentId: "I-8",
  contractId: contract.contractId,
  renewalId: null,
  dueDate: "2026-08-15",
  installmentNumber: 8,
  value: "20000",
  tax: null,
  amountPaid: "12500",
  balance: "7500",
  companyContribution: null,
  workerContribution: null,
  agreement: null,
  legacyStatus: null,
  agreementDate: null,
  observation: null,
};

function service(masterOverrides: Partial<MasterQueryService> = {}) {
  const master = {
    findPersonByDocument: jest.fn(async () => person),
    getContractsByPerson: jest.fn(async () => [contract]),
    getOutstandingInstallments: jest.fn(async () => [installment]),
    ...masterOverrides,
  } as unknown as MasterQueryService;
  const config = {
    get: jest.fn(() => "master"),
  } as unknown as ConfigService<EnvConfig, true>;
  const lookup = new PaymentsLookupService(
    {} as never,
    { findByPublicReference: jest.fn() } as never,
    master,
    config,
  );
  return { lookup, master };
}

describe("PaymentsLookupService Master boundary", () => {
  it("returns the certified outstanding Master installment as a read-only online-payment candidate", async () => {
    const { lookup } = service();

    await expect(lookup.lookup({ documentType: "CC", documentNumber: person.document! })).resolves.toEqual({
      type: "customer",
      customer: {
        fullName: "ANA PEREZ",
        documentType: "CC",
        maskedDocumentNumber: "•••••6789",
      },
      obligations: [{
        obligationId: "master:100:I-8",
        concept: "Cuota 8",
        amountCents: 750000,
        currency: "COP",
        dueDate: new Date("2026-08-15T12:00:00.000Z"),
        status: expect.any(String),
        source: "master",
        onlinePaymentAvailable: false,
      }],
    });
  });

  it("keeps wrong document type and zero-debt records indistinguishable from not-found", async () => {
    const { lookup } = service();
    await expect(lookup.lookup({ documentType: "CE", documentNumber: person.document! })).rejects.toBeInstanceOf(NotFoundException);

    const noDebt = service({
      getOutstandingInstallments: jest.fn(async () => []),
    });
    await expect(noDebt.lookup.lookup({ documentType: "CC", documentNumber: person.document! })).rejects.toMatchObject({
      response: expect.objectContaining({ message: "No se encontraron resultados." }),
    });
  });
});
