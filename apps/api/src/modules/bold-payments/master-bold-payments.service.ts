import { ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { MasterPaymentWriteClient, MasterPaymentWriteUnavailableError, type MasterProcedureRow } from "../master/firebird/master-payment-write.client";
import { MasterPaymentOrdersService, type MasterPaymentOrderRow } from "../payment-orders/master-payment-orders.service";
import type { BoldPaymentStatusResponse, CreateBoldPaymentResponse } from "./bold-payments.types";
import { MasterBoldLinkService } from "./master-bold-link.service";

function result(row: MasterProcedureRow): string {
  return String(row.RESULTADO ?? "").trim().toUpperCase();
}

function safeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendiente", PROCESSING: "Procesando", APPROVED: "Aprobado",
    REJECTED: "Rechazado", FAILED: "Fallido", EXPIRED: "Expirado", CANCELLED: "Cancelado",
  };
  return labels[status] ?? status;
}

@Injectable()
export class MasterBoldPaymentsService {
  constructor(
    private readonly orders: MasterPaymentOrdersService,
    private readonly bold: MasterBoldLinkService,
    private readonly writer: MasterPaymentWriteClient,
  ) {}

  async create(publicReference: string): Promise<CreateBoldPaymentResponse | null> {
    const order = await this.orders.find(publicReference);
    if (!order) return null;
    if (!["PENDING", "PROCESSING"].includes(order.status) || order.expires_at <= new Date()) {
      throw new ConflictException("Esta orden de pago no admite un nuevo intento de cobro.");
    }
    if (order.legacy_state !== "QUOTE_READY") {
      throw new ServiceUnavailableException("La obligación todavía no está preparada para el pago en línea.");
    }
    if (order.provider_link_id && order.provider_checkout_url) {
      return this.createResponse(order, order.provider_checkout_url);
    }
    const checkout = await this.bold.create(order);
    await this.orders.setProviderLink(order.id, checkout.linkId, checkout.checkoutUrl, checkout.raw);
    const refreshed = (await this.orders.find(publicReference))!;
    return this.createResponse(refreshed, checkout.checkoutUrl);
  }

  async getStatus(publicReference: string): Promise<BoldPaymentStatusResponse | null> {
    const order = await this.orders.find(publicReference);
    if (!order) return null;
    if (!order.provider_link_id) return this.statusResponse(order);

    const provider = await this.bold.status(order.provider_link_id);
    const expectedMajor = Number(order.amount_cents) / 100;
    if (provider.total !== null && Math.round(provider.total) !== expectedMajor) {
      await this.orders.markApplyRetry(order.id, "PROVIDER_AMOUNT_MISMATCH");
      throw new ServiceUnavailableException("El pago requiere revisión antes de aplicarse.");
    }

    switch (provider.status) {
      case "ACTIVE":
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "PENDING", raw: provider.raw });
        break;
      case "PROCESSING":
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "PROCESSING", transactionId: provider.transactionId, raw: provider.raw });
        break;
      case "REJECTED":
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "REJECTED", transactionId: provider.transactionId, raw: provider.raw });
        break;
      case "CANCELLED":
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "CANCELLED", transactionId: provider.transactionId, raw: provider.raw });
        break;
      case "EXPIRED":
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "EXPIRED", transactionId: provider.transactionId, raw: provider.raw });
        break;
      case "PAID":
        if (!provider.transactionId) throw new ServiceUnavailableException("El pago fue recibido pero requiere confirmación operativa.");
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "PROCESSING", transactionId: provider.transactionId, raw: provider.raw });
        await this.applyToMaster(order, provider.transactionId);
        break;
      default:
        await this.orders.setProviderState(order.id, { providerStatus: provider.status, orderStatus: "PROCESSING", transactionId: provider.transactionId, raw: provider.raw });
    }
    return this.statusResponse((await this.orders.find(publicReference))!);
  }

  private async applyToMaster(order: MasterPaymentOrderRow, transactionId: string): Promise<void> {
    if (order.legacy_state === "APPLIED_CONSISTENT") return;
    try {
      const amountMajor = Number(order.amount_cents) / 100;
      const verify = await this.writer.verifyQuote({
        quoteId: order.legacy_quote_id,
        transactionId,
        orderId: order.provider_link_id ?? order.public_reference,
        amount: amountMajor,
      });
      if (!["VERIFIED", "ALREADY_VERIFIED"].includes(result(verify))) throw new Error(`VERIFY_${result(verify)}`);

      const prepared = await this.writer.prepare(order.legacy_quote_id);
      if (result(prepared) !== "READY_MASTER") throw new Error(`PREPARE_${result(prepared)}`);

      const committed = await this.writer.commitMaster(order.legacy_quote_id);
      if (!["APPLIED_MASTER", "ALREADY_APPLIED"].includes(result(committed))) throw new Error(`COMMIT_${result(committed)}`);

      const reconciled = await this.writer.reconcile(order.legacy_quote_id);
      if (result(reconciled) !== "APPLIED_CONSISTENT") throw new Error(`RECONCILE_${result(reconciled)}`);
      await this.orders.markApplied(order.id, reconciled);
    } catch (error) {
      const code = error instanceof MasterPaymentWriteUnavailableError ? error.message : error instanceof Error ? error.message.slice(0, 100) : "MASTER_APPLY_FAILED";
      await this.orders.markApplyRetry(order.id, code);
      // Money may already be at Bold. Never convert this into a false payment
      // failure or trigger an automatic refund; keep it PROCESSING for safe,
      // idempotent reconciliation/retry.
    }
  }

  private createResponse(order: MasterPaymentOrderRow, redirectUrl: string): CreateBoldPaymentResponse {
    return {
      publicReference: order.public_reference,
      orderStatus: order.status,
      orderStatusLabel: safeStatusLabel(order.status),
      providerNextAction: { redirectUrl },
    };
  }

  private statusResponse(order: MasterPaymentOrderRow): BoldPaymentStatusResponse {
    return {
      publicReference: order.public_reference,
      orderStatus: order.status,
      orderStatusLabel: safeStatusLabel(order.status),
      attemptStatus: order.provider_status,
      receiptAvailable: false,
    };
  }
}
