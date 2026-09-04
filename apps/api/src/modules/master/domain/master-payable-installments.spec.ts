import type { Installment } from "./master.models";
import { payableInstallmentStatus, selectPayableInstallments } from "./master-payable-installments";

function installment(id: string, dueDate: string | null, balance: string | null, number: number): Installment {
  return {
    installmentId: id,
    contractId: "C-1",
    renewalId: null,
    dueDate,
    installmentNumber: number,
    value: balance,
    tax: null,
    amountPaid: null,
    balance,
    companyContribution: null,
    workerContribution: null,
    agreement: null,
    legacyStatus: null,
    agreementDate: null,
    observation: null,
  };
}

describe("ASODEF payable installment rule", () => {
  const now = new Date("2026-09-15T15:00:00.000Z");

  it("includes all overdue balances plus only the current installment", () => {
    const rows = [
      installment("old-1", "2026-07-10", "20000", 1),
      installment("old-2", "2026-08-10", "15000", 2),
      installment("current", "2026-09-20", "30000", 3),
      installment("future", "2026-10-20", "30000", 4),
    ];

    expect(selectPayableInstallments(rows, now).map((row) => row.installmentId))
      .toEqual(["old-1", "old-2", "current"]);
  });

  it("uses remaining SALDO so a partially paid installment stays payable only for its remainder", () => {
    const rows = [
      installment("partial", "2026-08-10", "7500", 1),
      installment("paid", "2026-08-20", "0", 2),
      installment("current", "2026-09-20", "30000", 3),
    ];

    const result = selectPayableInstallments(rows, now);
    expect(result).toEqual([
      expect.objectContaining({ installmentId: "partial", balance: "7500" }),
      expect.objectContaining({ installmentId: "current", balance: "30000" }),
    ]);
  });

  it("fails closed on rows without a positive known balance or due date", () => {
    const rows = [
      installment("no-date", null, "1000", 1),
      installment("no-balance", "2026-08-10", null, 2),
      installment("negative", "2026-08-10", "-1", 3),
    ];
    expect(selectPayableInstallments(rows, now)).toEqual([]);
  });

  it("classifies selected rows as overdue or current", () => {
    expect(payableInstallmentStatus(installment("a", "2026-08-10", "1", 1), now)).toBe("OVERDUE");
    expect(payableInstallmentStatus(installment("b", "2026-09-20", "1", 2), now)).toBe("CURRENT");
  });
});
