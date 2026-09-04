import { describe, expect, it, vi } from "vitest";
import type { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
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

function harness(options?: { tokenValid?: boolean; rejected?: boolean; throws?: boolean }) {
  const selection = { personId: person.personId, contractId: contract.contractId, installmentId: installment.installmentId };
  const tokens = {
    verify: vi.fn(() => options?.tokenValid === false ? null : selection),
  } as unknown as MasterPaymentSelectionTokenService;
  const quotes = {
    quote: vi.fn(async () => {
      if (options?.throws) throw new Error("Master unavailable");
      if (options?.rejected) return { status: "REJECTED", reason: "INSTALLMENT_NOT_PAYABLE" } as const;
      return {
        status: "VERIFIED",
        data: {
          person,
          contract,
          installment,
          amountCents: 5_000_000,
          dueDate: new Date("2026-09-10T12:00:00.000Z"),
        },
      } as const;
    }),
  } as unknown as MasterPaymentQuoteService;
  return { service: new MasterPaymentPreflightService(quotes, tokens), quotes, tokens };
}

describe("MasterPaymentPreflightService", () => {
  it("uses the centralized Master quote and returns the current payable amount", async () => {
    const { service, quotes } = harness();

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
    expect(quotes.quote).toHaveBeenCalledWith(person.personId, contract.contractId, installment.installmentId);
  });

  it("does not query Master for an invalid or expired selector", async () => {
    const { service, quotes } = harness({ tokenValid: false });

    await expect(service.verify("tampered")).resolves.toBeNull();
    expect(quotes.quote).not.toHaveBeenCalled();
  });

  it("fails closed when the centralized quote rejects a no-longer-payable selection", async () => {
    const { service } = harness({ rejected: true });

    await expect(service.verify("master.v1.opaque")).resolves.toBeNull();
  });

  it("maps Master infrastructure failure to the public preflight's fail-closed null", async () => {
    const { service } = harness({ throws: true });

    await expect(service.verify("master.v1.opaque")).resolves.toBeNull();
  });
});
