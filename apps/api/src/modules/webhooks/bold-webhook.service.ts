import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment-providers/payment-provider.interface";
import { PaymentReceiptsService } from "../receipts/payment-receipts.service";
import { AuditService, AuditSource } from "../audit/audit.service";
import { canTransitionAttemptStatus, canTransitionOrderStatus, mapBoldPaymentStatus } from "../bold-payments/bold-payment-status-mapping";
import { MasterBoldWebhookService } from "./master-bold-webhook.service";
import { computeWebhookIdempotencyKey } from "./webhook-idempotency-key";
import { normalizeBoldWebhookPayload, type BoldWebhookPayload, type NormalizedBoldWebhookPayload } from "./bold-webhook-payload";

@Injectable()
export class BoldWebhookService {
  private readonly logger = new Logger(BoldWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly paymentReceiptsService: PaymentReceiptsService,
    private readonly auditService: AuditService,
    private readonly masterWebhookService: MasterBoldWebhookService,
  ) {}

  async receive(
    payload: BoldWebhookPayload,
    headers: Record<string, string | string[] | undefined>,
    rawBody?: Buffer,
  ): Promise<void> {
    const normalized = normalizeBoldWebhookPayload(payload);
    if (!normalized) return;

    const validation = await this.paymentProvider.validateNotification({ payload, headers, rawBody });
    const reference = normalized.reference;
    if (!reference) {
      this.logger.warn("Bold webhook without external reference acknowledged; no state mutation applied.");
      return;
    }

    const order = await this.prisma.paymentOrder.findUnique({ where: { publicReference: reference } });
    if (!order) {
      const matchedMaster = await this.masterWebhookService.receive(payload, normalized, validation.verified);
      if (!matchedMaster) {
        this.logger.warn(`Bold webhook for unknown order reference ${reference} acknowledged; nothing stored.`);
      }
      return;
    }

    const idempotencyKey = computeWebhookIdempotencyKey(payload);
    let event;
    try {
      event = await this.prisma.paymentEvent.create({
        data: {
          paymentOrderId: order.id,
          source: "bold",
          eventType: "webhook",
          idempotencyKey,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        this.logger.log(`Duplicate Bold webhook ${idempotencyKey} acknowledged without reprocessing.`);
        return;
      }
      throw error;
    }

    void this.processDelivery(event.id, payload, normalized, validation.verified).catch((error: unknown) => {
      this.logger.error(`Async Bold webhook processing failed for event ${event.id}: ${(error as Error).message}`);
    });
  }

  private async processDelivery(
    eventId: string,
    payload: BoldWebhookPayload,
    normalized: NormalizedBoldWebhookPayload,
    verified: boolean,
  ): Promise<void> {
    const reference = normalized.reference;
    if (!reference) return;

    const productionPaymentsEnabled = this.configService.get("PRODUCTION_PAYMENTS_ENABLED", { infer: true });
    if (!verified && productionPaymentsEnabled) {
      const unverifiedOrder = await this.prisma.paymentOrder.findUnique({ where: { publicReference: reference } });
      await this.prisma.$transaction(async (tx) => {
        if (unverifiedOrder) {
          await this.auditService.record(tx, {
            paymentOrderId: unverifiedOrder.id,
            action: "order.unverified_signature_blocked",
            previousStatus: unverifiedOrder.status,
            newStatus: unverifiedOrder.status,
            applied: false,
            source: AuditSource.WEBHOOK,
          });
        }
        await tx.paymentEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
      });
      return;
    }

    // Current official VOID notifications are valid and auditable but they are
    // not payment-status transitions in the modern order state machine. Refund/
    // void semantics remain owned by the dedicated refund/reconciliation flow.
    const providerStatus = normalized.providerStatus;
    if (!providerStatus) {
      await this.prisma.paymentEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
      return;
    }

    const mapping = mapBoldPaymentStatus(providerStatus);
    if (!mapping.isKnownBoldStatus) {
      this.logger.warn(`Unknown Bold webhook status "${providerStatus}" for reference ${reference}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM payment_orders WHERE public_reference = ${reference} FOR UPDATE
      `;
      const lockedId = lockRows[0]?.id;
      if (!lockedId) {
        this.logger.error(`Order ${reference} vanished between webhook receipt and processing.`);
        return;
      }

      const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: lockedId } });
      const latestAttempt = await tx.paymentAttempt.findFirst({ where: { paymentOrderId: order.id }, orderBy: { createdAt: "desc" } });

      if (latestAttempt) {
        if (canTransitionAttemptStatus(latestAttempt.status, mapping.attemptStatus)) {
          await tx.paymentAttempt.update({ where: { id: latestAttempt.id }, data: { status: mapping.attemptStatus } });
        } else {
          this.logger.warn(`Blocked PaymentAttempt transition ${latestAttempt.status} -> ${mapping.attemptStatus} for ${reference}.`);
        }

        await tx.paymentTransaction.create({
          data: {
            paymentAttemptId: latestAttempt.id,
            status: providerStatus,
            rawResponse: payload as unknown as Prisma.InputJsonValue,
          },
        });
      }

      if (canTransitionOrderStatus(order.status, mapping.orderStatus)) {
        const updatedOrder = await tx.paymentOrder.update({ where: { id: order.id }, data: { status: mapping.orderStatus } });
        await this.paymentReceiptsService.issueIfNewlyApproved(tx, order.status, updatedOrder);
        await this.auditService.record(tx, {
          paymentOrderId: order.id,
          action: "order.status_transition",
          previousStatus: order.status,
          newStatus: updatedOrder.status,
          applied: true,
          source: AuditSource.WEBHOOK,
        });
      } else {
        await this.auditService.record(tx, {
          paymentOrderId: order.id,
          action: "order.status_transition",
          previousStatus: order.status,
          newStatus: mapping.orderStatus,
          applied: false,
          source: AuditSource.WEBHOOK,
        });
      }

      await tx.paymentEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
    });
  }
}
