import { randomUUID } from "node:crypto";
import { Logger, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { MasterPaymentOrdersService } from "../payment-orders/master-payment-orders.service";
import { computeWebhookIdempotencyKey } from "./webhook-idempotency-key";
import type { BoldWebhookPayload, NormalizedBoldWebhookPayload } from "./bold-webhook-payload";

@Injectable()
export class MasterBoldWebhookService {
  private readonly logger = new Logger(MasterBoldWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: MasterPaymentOrdersService,
  ) {}

  /** Returns true only when the reference belongs to a Master order. */
  async receive(
    payload: BoldWebhookPayload,
    normalized: NormalizedBoldWebhookPayload,
    verified: boolean,
  ): Promise<boolean> {
    if (!normalized.reference) return false;
    const order = await this.orders.find(normalized.reference);
    if (!order) return false;

    const eventId = randomUUID();
    const idempotencyKey = normalized.notificationId
      ? `bold-webhook:${normalized.notificationId}`
      : `bold-webhook:${computeWebhookIdempotencyKey(payload)}`;

    const inserted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id
        FROM legacy_bridge.master_payment_orders
        WHERE id = ${order.id}::uuid
        FOR UPDATE
      `;

      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO legacy_bridge.master_payment_events (
          id, order_id, source, event_type, idempotency_key, payload
        ) VALUES (
          ${eventId}::uuid,
          ${order.id}::uuid,
          'bold',
          'payment.webhook',
          ${idempotencyKey},
          ${JSON.stringify(payload)}::jsonb
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id::text AS id
      `;
      return rows[0]?.id ?? null;
    });

    if (!inserted) {
      this.logger.log(`Duplicate Bold Master webhook ${idempotencyKey} acknowledged without reprocessing.`);
      return true;
    }

    void this.processDelivery(inserted, order.id, payload, normalized, verified).catch((error: unknown) => {
      this.logger.error(`Async Bold Master webhook processing failed for event ${inserted}: ${(error as Error).message}`);
    });
    return true;
  }

  private async processDelivery(
    eventId: string,
    orderId: string,
    payload: BoldWebhookPayload,
    normalized: NormalizedBoldWebhookPayload,
    verified: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = (await tx.$queryRaw<{
        provider_transaction_id: string | null;
        provider_status: string | null;
        status: string;
        legacy_application_state: string;
        reconciliation_result: string | null;
        failure_code: string | null;
      }[]>`
        SELECT provider_transaction_id,
               provider_status,
               status,
               legacy_application_state,
               reconciliation_result,
               failure_code
        FROM legacy_bridge.master_payment_orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE
      `)[0];
      if (!locked) return;

      if (!verified) {
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_orders
          SET reconciliation_result = 'BOLD_WEBHOOK_UNVERIFIED', updated_at = now()
          WHERE id = ${orderId}::uuid
        `;
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_events SET processed_at = now() WHERE id = ${eventId}::uuid
        `;
        return;
      }

      const transactionId = normalized.transactionId;
      if (transactionId && locked.provider_transaction_id && locked.provider_transaction_id !== transactionId) {
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_orders
          SET reconciliation_result = 'BOLD_TRANSACTION_ID_MISMATCH', updated_at = now()
          WHERE id = ${orderId}::uuid
        `;
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_events SET processed_at = now() WHERE id = ${eventId}::uuid
        `;
        return;
      }

      const approved = normalized.eventType === "SALE_APPROVED"
        || (normalized.format === "legacy" && normalized.providerStatus === "APPROVED");
      const rejected = normalized.eventType === "SALE_REJECTED"
        || (normalized.format === "legacy" && normalized.providerStatus === "REJECTED");
      const voidApproved = normalized.eventType === "VOID_APPROVED";

      if (approved) {
        const alreadyVoided = locked.provider_status === "VOID_APPROVED"
          || locked.failure_code === "BOLD_VOID_APPROVED"
          || locked.reconciliation_result === "BOLD_VOID_AFTER_LEGACY_APPLIED";

        if (alreadyVoided) {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_raw = ${JSON.stringify(payload)}::jsonb,
                reconciliation_result = 'BOLD_APPROVED_AFTER_VOID',
                updated_at = now()
            WHERE id = ${orderId}::uuid
          `;
        } else {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_status = 'APPROVED',
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                provider_raw = ${JSON.stringify(payload)}::jsonb,
                status = CASE WHEN legacy_application_state = 'APPLIED' THEN status ELSE 'PROCESSING' END,
                legacy_application_state = CASE WHEN legacy_application_state = 'APPLIED' THEN 'APPLIED' ELSE 'PENDING_WRITE_BRIDGE' END,
                reconciliation_result = 'BOLD_WEBHOOK_VERIFIED',
                failure_code = NULL,
                updated_at = now()
            WHERE id = ${orderId}::uuid
          `;
        }
      } else if (rejected) {
        if (["PENDING_WRITE_BRIDGE", "APPLIED"].includes(locked.legacy_application_state)) {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_raw = ${JSON.stringify(payload)}::jsonb,
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                reconciliation_result = 'BOLD_REJECTED_AFTER_CONFIRMATION',
                updated_at = now()
            WHERE id = ${orderId}::uuid
          `;
        } else {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_status = 'REJECTED',
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                provider_raw = ${JSON.stringify(payload)}::jsonb,
                status = 'REJECTED',
                reconciliation_result = 'BOLD_WEBHOOK_VERIFIED',
                failure_code = NULL,
                updated_at = now()
            WHERE id = ${orderId}::uuid
          `;
        }
      } else if (voidApproved) {
        if (locked.legacy_application_state === "APPLIED") {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_raw = ${JSON.stringify(payload)}::jsonb,
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                reconciliation_result = 'BOLD_VOID_AFTER_LEGACY_APPLIED',
                updated_at = now()
            WHERE id = ${orderId}::uuid
          `;
        } else {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_status = 'VOID_APPROVED',
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                provider_raw = ${JSON.stringify(payload)}::jsonb,
                status = 'CANCELLED',
                legacy_application_state = 'NOT_APPLIED',
                reconciliation_result = 'BOLD_VOID_VERIFIED',
                failure_code = 'BOLD_VOID_APPROVED',
                updated_at = now()
            WHERE id = ${orderId}::uuid
          `;
        }
      } else {
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_orders
          SET provider_raw = ${JSON.stringify(payload)}::jsonb,
              provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
              reconciliation_result = 'BOLD_WEBHOOK_RECORDED_NO_TRANSITION',
              updated_at = now()
          WHERE id = ${orderId}::uuid
        `;
      }

      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_events SET processed_at = now() WHERE id = ${eventId}::uuid
      `;
    });
  }
}
