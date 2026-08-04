import type { StatusTone } from "@asodef/ui";

/**
 * US-031: the 5 states named verbatim in the story's own description
 * ("approved/pending/rejected/failed/expired"). Only 3 visual tones are
 * called for in the AC ("green/orange/neutral") - REJECTED/FAILED
 * deliberately do NOT use the danger/red tone the generic StatusBadge
 * tone map would otherwise pick, since a calmer amber reads as "try
 * again", not "something is broken" - an explicit product decision in
 * the AC text, not an oversight.
 */
export type PaymentResultState = "approved" | "pending" | "rejected" | "failed" | "expired";

export function toPaymentResultState(orderStatus: string): PaymentResultState {
  switch (orderStatus) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "FAILED":
      return "failed";
    case "EXPIRED":
      return "expired";
    case "PENDING":
    case "PROCESSING":
      return "pending";
    default:
      // CANCELLED/REFUNDED/PARTIALLY_REFUNDED/DRAFT/unknown - never
      // implied as a success; "pending" is the safest generic framing
      // ("we are still confirming this") for the four states this page
      // does not otherwise have a name for.
      return "pending";
  }
}

export interface PaymentResultConfig {
  tone: StatusTone;
  heading: string;
  description: string;
}

export const PAYMENT_RESULT_CONFIG: Record<PaymentResultState, PaymentResultConfig> = {
  approved: {
    tone: "success",
    heading: "Pago aprobado",
    description: "Tu pago fue procesado exitosamente.",
  },
  pending: {
    tone: "warning",
    heading: "Pago en proceso",
    description: "Estamos confirmando tu pago. Esto puede tardar unos minutos.",
  },
  rejected: {
    tone: "warning",
    heading: "Pago rechazado",
    description: "El proveedor de pagos rechazó esta transacción.",
  },
  failed: {
    tone: "warning",
    heading: "No pudimos procesar tu pago",
    description: "Ocurrió un problema al procesar tu pago.",
  },
  expired: {
    tone: "expired",
    heading: "La orden expiró",
    description: "El tiempo para completar este pago venció.",
  },
};
