import { describe, expect, it } from "vitest";
import { toPublicMasterPaymentPreflightResponse } from "./master-payment-preflight.types";

describe("toPublicMasterPaymentPreflightResponse", () => {
  it("omits all raw legacy identifiers from the public response", () => {
    const response = toPublicMasterPaymentPreflightResponse({
      personId: "1012345678",
      document: "1012345678",
      documentType: "CC",
      fullName: "Ana Pérez",
      contractId: "900001",
      installmentId: "42",
      concept: "Cuota 8",
      amountCents: 5_000_000,
      currency: "COP",
      dueDate: new Date("2026-09-10T12:00:00.000Z"),
      status: "OVERDUE",
    });

    expect(response).toEqual({
      source: "master",
      customer: {
        fullName: "Ana Pérez",
        documentType: "CC",
        maskedDocumentNumber: "••••••5678",
      },
      obligation: {
        concept: "Cuota 8",
        amountCents: 5_000_000,
        currency: "COP",
        dueDate: new Date("2026-09-10T12:00:00.000Z"),
        status: "OVERDUE",
      },
      onlinePaymentAvailable: false,
    });
    expect(JSON.stringify(response)).not.toMatch(/1012345678|900001|"42"/);
  });
});
