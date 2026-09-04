import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment-providers/payment-provider.interface";
import { MasterPaymentOrdersService } from "../payment-orders/master-payment-orders.service";

type BoldWebhookData = {
  payment_id?: string;
  metadata?: { reference?: string | null };
};

type BoldWebhookNotification = {
  id: string;
  type: string;
  subject?: string;
  data: BoldWebhookData;
};

export interface MasterBoldWebhookResult {
  received: true;
  verified: true;
  matched: boolean;
  duplicate: boolean;
  stateChanged: boolean;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseNotification(payload: unknown): BoldWebhookNotification | null {
  const root = objectValue(payload);
  const data = objectValue(root?.data);
  const metadata = objectValue(data?.metadata);
  if (!root || !data || typeof root.id !== "string" || root.id.length === 0 || typeof root.type !== "string" || root.type.length === 0) {
    return null;
  }

  return {
    id: root.id,
    type: root.type,
    subject: typeof root.subject === "string" ? root.subject : undefined,
    data: {
      payment_id: typeof data.payment_id === "string" ? data.payment_id : undefined,
      metadata: metadata
        ? { reference: typeof metadata.reference === "string" || metadata.reference === null ? metadata.reference : undefined }
        : undefined,
    },
  };
}

@Injectable()
export class MasterBoldWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: MasterPaymentOrdersService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async handle(
    payload: unknown,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<MasterBoldWebhookResult> {
    const validation = await this.paymentProvider.validateNotification({ payload, rawBody, headers });
    if (!validation.verified) {
      throw new BadRequestException("Firma de webhook inválida.");
    }

    const notification = parseNotification(payload);
    if (!notification) {
      throw new BadRequestException("Notificación de webhook inválida.");
    }

    const publicReference = notification.data.metadata?.reference;
    if (!publicReference) {
      return { received: true, verified: true, matched: false, duplicate: false, stateChanged: false };
    }

    const order = await this.orders.find(publicReference);
    if (!order) {
      // A single Bold webhook endpoint may receive events for payment flows
      // outside Master. Acknowledge them without mutating the modern payment
      // state machine; that path remains independently controlled.
      return { received: true, verified: true, matched: false, duplicate: false, stateChanged: false };
    }

    const transactionId = notification.data.payment_id ?? notification.subject ?? null;
    return this.prisma.$transaction(async (tx) => {
      const locked = (await tx.$queryRaw<{
        provider_transaction_id: string | null;
        legacy_application_state: string;
      }[]>`
        SELECT provider_transaction_id, legacy_application_state
        FROM legacy_bridge.master_payment_orders
        WHERE id = ${order.id}::uuid
        FOR UPDATE
      `)[0];

      if (!locked) {
        return { received: true, verified: true, matched: false, duplicate: false, stateChanged: false };
      }

      const eventRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO legacy_bridge.master_payment_events (
          id, order_id, source, event_type, idempotency_key, payload, processed_at
        ) VALUES (
          ${randomUUID()}::uuid,
          ${order.id}::uuid,
          'bold',
          'payment.webhook',
          ${`bold-webhook:${notification.id}`},
          ${JSON.stringify(payload)}::jsonb,
          now()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id::text AS id
      `;

      if (eventRows.length === 0) {
        return { received: true, verified: true, matched: true, duplicate: true, stateChanged: false };
      }

      if (transactionId && locked.provider_transaction_id && locked.provider_transaction_id !== transactionId) {
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_orders
          SET reconciliation_result = 'BOLD_TRANSACTION_ID_MISMATCH', updated_at = now()
          WHERE id = ${order.id}::uuid
        `;
        return { received: true, verified: true, matched: true, duplicate: false, stateChanged: false };
      }

      if (notification.type === "SALE_APPROVED") {
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
          WHERE id = ${order.id}::uuid
        `;
        return { received: true, verified: true, matched: true, duplicate: false, stateChanged: true };
      }

      if (notification.type === "SALE_REJECTED") {
        if (["PENDING_WRITE_BRIDGE", "APPLIED"].includes(locked.legacy_application_state)) {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_raw = ${JSON.stringify(payload)}::jsonb,
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                reconciliation_result = 'BOLD_REJECTED_AFTER_CONFIRMATION',
                updated_at = now()
            WHERE id = ${order.id}::uuid
          `;
          return { received: true, verified: true, matched: true, duplicate: false, stateChanged: false };
        }

        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_orders
          SET provider_status = 'REJECTED',
              provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
              provider_raw = ${JSON.stringify(payload)}::jsonb,
              status = 'REJECTED',
              reconciliation_result = 'BOLD_WEBHOOK_VERIFIED',
              failure_code = NULL,
              updated_at = now()
          WHERE id = ${order.id}::uuid
        `;
        return { received: true, verified: true, matched: true, duplicate: false, stateChanged: true };
      }

      if (notification.type === "VOID_APPROVED") {
        if (locked.legacy_application_state === "APPLIED") {
          await tx.$executeRaw`
            UPDATE legacy_bridge.master_payment_orders
            SET provider_raw = ${JSON.stringify(payload)}::jsonb,
                provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
                reconciliation_result = 'BOLD_VOID_AFTER_LEGACY_APPLIED',
                updated_at = now()
            WHERE id = ${order.id}::uuid
          `;
          return { received: true, verified: true, matched: true, duplicate: false, stateChanged: false };
        }

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
          WHERE id = ${order.id}::uuid
        `;
        return { received: true, verified: true, matched: true, duplicate: false, stateChanged: true };
      }

      // VOID_REJECTED and future signed event types are retained for audit but
      // do not invent a payment transition. A later provider poll/reconciliation
      // may determine the canonical state.
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET provider_raw = ${JSON.stringify(payload)}::jsonb,
            provider_transaction_id = COALESCE(provider_transaction_id, ${transactionId}),
            reconciliation_result = 'BOLD_WEBHOOK_RECORDED_NO_TRANSITION',
            updated_at = now()
        WHERE id = ${order.id}::uuid
      `;
      return { received: true, verified: true, matched: true, duplicate: false, stateChanged: false };
    });
  }
}
