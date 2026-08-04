import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment-providers/payment-provider.interface";
import { canTransitionAttemptStatus, canTransitionOrderStatus, mapBoldPaymentStatus } from "../bold-payments/bold-payment-status-mapping";
import { computeWebhookIdempotencyKey } from "./webhook-idempotency-key";
import type { BoldWebhookPayload } from "./bold-webhook-payload";

/**
 * US-026. Two distinct halves, on purpose:
 *  - receive(): synchronous, fast - validate signature (best-effort,
 *    logged), resolve the order, dedupe + persist the raw PaymentEvent.
 *    The controller awaits only this before responding 202.
 *  - processDelivery(): the heavier state-transition work, dispatched
 *    from receive() without being awaited (no queue/job infrastructure
 *    exists in this project yet - a detached, self-caught async call is
 *    the smallest correct mechanism for "respond fast, process after").
 */
@Injectable()
export class BoldWebhookService {
  private readonly logger = new Logger(BoldWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async receive(payload: BoldWebhookPayload, headers: Record<string, string | string[] | undefined>): Promise<void> {
    // BoldPaymentProvider.validateNotification() already logs its own
    // "unverified" warning (US-022) - the boolean is threaded through to
    // processDelivery, which is what actually decides whether an
    // unverified event may drive a transition.
    const validation = await this.paymentProvider.validateNotification({ payload, headers });

    const order = await this.prisma.paymentOrder.findUnique({ where: { publicReference: payload.reference_id } });
    if (!order) {
      // Acknowledge anyway (nothing structurally wrong with the
      // request) - never make Bold retry forever over an order that
      // simply doesn't exist here. Nothing to store: PaymentEvent
      // requires a real paymentOrderId.
      this.logger.warn(`Bold webhook for unknown order reference ${payload.reference_id} - acknowledged, nothing stored`, BoldWebhookService.name);
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
        this.logger.log(
          `Duplicate Bold webhook delivery detected (idempotencyKey=${idempotencyKey}) - acknowledged, not reprocessed`,
          BoldWebhookService.name,
        );
        return;
      }
      throw error;
    }

    void this.processDelivery(event.id, payload, validation.verified).catch((error: unknown) => {
      this.logger.error(`Async Bold webhook processing failed for event ${event.id}: ${(error as Error).message}`, BoldWebhookService.name);
    });
  }

  private async processDelivery(eventId: string, payload: BoldWebhookPayload, verified: boolean): Promise<void> {
    const mapping = mapBoldPaymentStatus(payload.status);
    if (!mapping.isKnownBoldStatus) {
      this.logger.warn(`Unknown Bold webhook status "${payload.status}" for reference ${payload.reference_id}`, BoldWebhookService.name);
    }

    const productionPaymentsEnabled = this.configService.get("PRODUCTION_PAYMENTS_ENABLED", { infer: true });
    if (!verified && productionPaymentsEnabled) {
      // PRD rule: once real money is in play, an unverified signature
      // must never alone drive a transition. In BOLD_MODE=mock (Phase 1)
      // every webhook is unverified by construction - this gate only
      // actually engages once PRODUCTION_PAYMENTS_ENABLED is true, at
      // which point a real, confirmed signature scheme (TODO: verify
      // against Bold's merchant dashboard) must exist before it can
      // safely be relaxed.
      this.logger.warn(
        `Unverified Bold webhook for reference ${payload.reference_id} received with PRODUCTION_PAYMENTS_ENABLED=true - stored for reconciliation, no state transition applied`,
        BoldWebhookService.name,
      );
      await this.prisma.paymentEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM payment_orders WHERE public_reference = ${payload.reference_id} FOR UPDATE
      `;
      const lockedId = lockRows[0]?.id;
      if (!lockedId) {
        this.logger.error(`Order ${payload.reference_id} vanished between webhook receipt and processing`, BoldWebhookService.name);
        return;
      }

      const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: lockedId } });
      const latestAttempt = await tx.paymentAttempt.findFirst({ where: { paymentOrderId: order.id }, orderBy: { createdAt: "desc" } });

      if (latestAttempt) {
        if (canTransitionAttemptStatus(latestAttempt.status, mapping.attemptStatus)) {
          await tx.paymentAttempt.update({ where: { id: latestAttempt.id }, data: { status: mapping.attemptStatus } });
        } else {
          this.logger.warn(
            `Blocked invalid PaymentAttempt transition ${latestAttempt.status} -> ${mapping.attemptStatus} from webhook for reference ${payload.reference_id}`,
            BoldWebhookService.name,
          );
        }

        await tx.paymentTransaction.create({
          data: { paymentAttemptId: latestAttempt.id, status: payload.status, rawResponse: payload as unknown as Prisma.InputJsonValue },
        });
      }

      if (canTransitionOrderStatus(order.status, mapping.orderStatus)) {
        await tx.paymentOrder.update({ where: { id: order.id }, data: { status: mapping.orderStatus } });
      } else {
        this.logger.warn(
          `Blocked invalid PaymentOrder transition ${order.status} -> ${mapping.orderStatus} from webhook for reference ${payload.reference_id}`,
          BoldWebhookService.name,
        );
      }

      await tx.paymentEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
    });
  }
}
