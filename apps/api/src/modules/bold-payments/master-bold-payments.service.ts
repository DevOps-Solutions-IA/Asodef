import { ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PaymentOrderStatus } from "@prisma/client";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment-providers/payment-provider.interface";
import { MasterPaymentOrdersService, type MasterPaymentOrderRow } from "../payment-orders/master-payment-orders.service";
import { mapBoldPaymentStatus } from "./bold-payment-status-mapping";
import type { BoldPaymentStatusResponse, CreateBoldPaymentResponse } from "./bold-payments.types";

function safeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    PROCESSING: "Procesando",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
    FAILED: "Fallido",
    EXPIRED: "Expirado",
    CANCELLED: "Cancelado",
  };
  return labels[status] ?? status;
}

@Injectable()
export class MasterBoldPaymentsService {
  constructor(
    private readonly orders: MasterPaymentOrdersService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async create(publicReference: string): Promise<CreateBoldPaymentResponse | null> {
    const order = await this.orders.find(publicReference);
    if (!order) return null;

    if (!["PENDING", "PROCESSING"].includes(order.status)) {
      throw new ConflictException("Esta orden de pago no admite un nuevo intento de cobro.");
    }
    if (order.status === "PENDING" && order.expires_at <= new Date()) {
      throw new ConflictException("Esta orden de pago expiró. Consulta nuevamente la obligación.");
    }

    // Once the provider has returned a durable result, replay it. Never call
    // createPayment twice for the same Master order.
    if (order.provider_status && !["CREATE_CLAIMED", "CREATE_UNKNOWN"].includes(order.provider_status)) {
      return this.createResponse(order, order.provider_raw);
    }
    if (["CREATE_CLAIMED", "CREATE_UNKNOWN"].includes(order.provider_status ?? "")) {
      throw new ServiceUnavailableException("El inicio del cobro requiere conciliación antes de volver a intentarse.");
    }

    // Re-read Master immediately before claiming the provider call. The amount
    // sent to Bold is always the immutable server snapshot, never browser input.
    await this.orders.revalidateForCheckout(order);
    const claimed = await this.orders.claimProviderCreate(order.id);
    if (!claimed) {
      const refreshed = await this.orders.find(publicReference);
      if (refreshed?.provider_status && !["CREATE_CLAIMED", "CREATE_UNKNOWN"].includes(refreshed.provider_status)) {
        return this.createResponse(refreshed, refreshed.provider_raw);
      }
      throw new ConflictException("Ya existe un intento de cobro en curso para esta orden.");
    }

    let result;
    try {
      result = await this.paymentProvider.createPayment({
        publicReference: claimed.public_reference,
        amountCents: Number(claimed.amount_cents),
        currency: claimed.currency,
      });
    } catch {
      // A timeout/network failure may have happened after Bold accepted the
      // request. Fail closed and require status reconciliation; never retry a
      // provider create blindly because that could duplicate the charge.
      await this.orders.markProviderCreateUnknown(claimed.id);
      throw new ServiceUnavailableException("No fue posible confirmar el resultado del inicio del cobro. La orden quedó protegida para conciliación.");
    }

    const transition = this.providerTransition(result.status, claimed);
    await this.orders.recordProviderResult(claimed.id, {
      providerStatus: result.status,
      orderStatus: transition.orderStatus,
      providerConfirmed: transition.providerConfirmed,
      raw: result.raw,
      eventType: "payment.create",
    });

    const refreshed = (await this.orders.find(publicReference))!;
    return this.createResponse(refreshed, result.raw);
  }

  async getStatus(publicReference: string): Promise<BoldPaymentStatusResponse | null> {
    const order = await this.orders.find(publicReference);
    if (!order) return null;
    if (!order.provider_status) return this.statusResponse(order);

    let result;
    try {
      result = await this.paymentProvider.getPaymentStatus(order.public_reference);
    } catch {
      throw new ServiceUnavailableException("No fue posible confirmar el estado del pago con el proveedor.");
    }

    const transition = this.providerTransition(result.status, order);
    await this.orders.recordProviderResult(order.id, {
      providerStatus: result.status,
      orderStatus: transition.orderStatus,
      providerConfirmed: transition.providerConfirmed,
      raw: result.raw,
      eventType: "payment.status",
    });

    return this.statusResponse((await this.orders.find(publicReference))!);
  }

  private providerTransition(providerStatus: string, order: MasterPaymentOrderRow): {
    orderStatus: "PROCESSING" | "REJECTED";
    providerConfirmed: boolean;
  } {
    const mapping = mapBoldPaymentStatus(providerStatus);
    const alreadyConfirmed = order.legacy_application_state === "PENDING_WRITE_BRIDGE"
      || order.legacy_application_state === "APPLIED";

    // This is the central separation invariant: Bold APPROVED means ASODEF has
    // confirmed money, but the Master order remains PROCESSING until the future
    // approved write bridge reports that AdaSys applied it.
    if (mapping.orderStatus === PaymentOrderStatus.APPROVED || alreadyConfirmed) {
      return { orderStatus: "PROCESSING", providerConfirmed: true };
    }
    if (mapping.orderStatus === PaymentOrderStatus.REJECTED) {
      return { orderStatus: "REJECTED", providerConfirmed: false };
    }
    return { orderStatus: "PROCESSING", providerConfirmed: false };
  }

  private createResponse(order: MasterPaymentOrderRow, providerNextAction: unknown): CreateBoldPaymentResponse {
    return {
      publicReference: order.public_reference,
      orderStatus: order.status,
      orderStatusLabel: safeStatusLabel(order.status),
      providerNextAction,
    };
  }

  private statusResponse(order: MasterPaymentOrderRow): BoldPaymentStatusResponse {
    return {
      publicReference: order.public_reference,
      orderStatus: order.status,
      orderStatusLabel: safeStatusLabel(order.status),
      attemptStatus: order.provider_status,
      receiptAvailable: false,
      source: "master",
      legacyApplicationStatus: order.legacy_application_state,
    };
  }
}
