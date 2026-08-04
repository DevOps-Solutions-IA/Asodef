import { describe, expect, it } from "vitest";
import {
  getPaymentOrderStatusLabel,
  isKnownPaymentOrderStatus,
  PAYMENT_ORDER_STATUS_LABELS_ES,
  PAYMENT_ORDER_STATUSES,
} from "./payment-order-status";

describe("Payment order status map (US-023 acceptance criteria, exact labels)", () => {
  it("has exactly the 10 internal statuses, in the PRD's own order", () => {
    expect(PAYMENT_ORDER_STATUSES).toEqual([
      "DRAFT",
      "PENDING",
      "PROCESSING",
      "APPROVED",
      "REJECTED",
      "FAILED",
      "EXPIRED",
      "CANCELLED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
    ]);
  });

  it("maps every status to its exact Spanish label from the acceptance criteria", () => {
    expect(PAYMENT_ORDER_STATUS_LABELS_ES).toEqual({
      DRAFT: "Borrador",
      PENDING: "Pendiente",
      PROCESSING: "Procesando",
      APPROVED: "Aprobado",
      REJECTED: "Rechazado",
      FAILED: "Fallido",
      EXPIRED: "Vencido",
      CANCELLED: "Cancelado",
      REFUNDED: "Reembolsado",
      PARTIALLY_REFUNDED: "Reembolso parcial",
    });
  });

  it("is exhaustive - every status has a label and no extra labels exist", () => {
    expect(Object.keys(PAYMENT_ORDER_STATUS_LABELS_ES).sort()).toEqual([...PAYMENT_ORDER_STATUSES].sort());
  });

  it("getPaymentOrderStatusLabel returns the same label as the lookup table for every status", () => {
    for (const status of PAYMENT_ORDER_STATUSES) {
      expect(getPaymentOrderStatusLabel(status)).toBe(PAYMENT_ORDER_STATUS_LABELS_ES[status]);
    }
  });

  it("isKnownPaymentOrderStatus recognizes every documented status and rejects unknowns", () => {
    for (const status of PAYMENT_ORDER_STATUSES) {
      expect(isKnownPaymentOrderStatus(status)).toBe(true);
    }
    expect(isKnownPaymentOrderStatus("SOME_FUTURE_STATUS")).toBe(false);
  });
});
