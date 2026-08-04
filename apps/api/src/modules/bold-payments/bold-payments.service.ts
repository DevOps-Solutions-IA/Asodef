import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PaymentAttemptStatus, PaymentOrderStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment-providers/payment-provider.interface";
import { PaymentReceiptsService } from "../receipts/payment-receipts.service";
import {
  canTransitionAttemptStatus,
  canTransitionOrderStatus,
  isAttemptStatusTerminal,
  mapBoldPaymentStatus,
} from "./bold-payment-status-mapping";
import {
  toBoldPaymentStatusResponse,
  toCreateBoldPaymentResponse,
  type BoldPaymentStatusResponse,
  type CreateBoldPaymentResponse,
} from "./bold-payments.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";
const PROVIDER_UNAVAILABLE_MESSAGE = "No fue posible iniciar el pago con el proveedor. Intenta nuevamente en unos minutos.";

// Orders in any of these statuses are not eligible to start (or resume)
// a Bold payment attempt - all of them are terminal for the order
// itself, or (DRAFT) not yet a real payable order.
const NON_PAYABLE_ORDER_STATUSES: readonly PaymentOrderStatus[] = [
  PaymentOrderStatus.DRAFT,
  PaymentOrderStatus.APPROVED,
  PaymentOrderStatus.REJECTED,
  PaymentOrderStatus.FAILED,
  PaymentOrderStatus.EXPIRED,
  PaymentOrderStatus.CANCELLED,
  PaymentOrderStatus.REFUNDED,
  PaymentOrderStatus.PARTIALLY_REFUNDED,
];

@Injectable()
export class BoldPaymentsService {
  private readonly logger = new Logger(BoldPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly paymentReceiptsService: PaymentReceiptsService,
  ) {}

  /**
   * US-025: POST /api/v1/payments/bold/create. The whole flow - lock,
   * validate, create-or-reuse the PaymentAttempt, call Bold, persist
   * the result - runs inside a single database transaction. That is a
   * deliberate trade-off, not an oversight: holding the `payment_orders`
   * row lock across the (mocked, near-instant) provider call is what
   * guarantees a concurrent second request for the same order blocks
   * until the first finishes, then finds the attempt already has a
   * PaymentTransaction and takes the idempotent-replay branch below
   * instead of calling Bold a second time - satisfying "database-backed
   * idempotency, no in-memory mutex" without adding a schema column
   * that isn't part of US-021's approved data model. A real HTTP
   * transport with live network latency would need a different
   * mechanism (e.g. a claimed-at column or a distributed lock) to avoid
   * holding a Postgres lock across a live round-trip - flagged as a
   * follow-up risk for when BOLD_MODE leaves mock, not a Phase-1
   * blocker.
   */
  async createPayment(publicReference: string): Promise<CreateBoldPaymentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM payment_orders WHERE public_reference = ${publicReference} FOR UPDATE
      `;
      const lockedId = lockRows[0]?.id;
      if (!lockedId) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }

      const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: lockedId } });
      if (NON_PAYABLE_ORDER_STATUSES.includes(order.status)) {
        throw new ConflictException("Esta orden de pago no admite un nuevo intento de cobro.");
      }

      const existingAttempt = await tx.paymentAttempt.findFirst({
        where: { paymentOrderId: order.id, status: PaymentAttemptStatus.PENDING },
        orderBy: { createdAt: "desc" },
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 1 } },
      });

      const lastTransaction = existingAttempt?.transactions[0];
      if (existingAttempt && lastTransaction) {
        // Idempotent replay: Bold was already asked once for this
        // attempt - never call it again while it remains unresolved.
        return toCreateBoldPaymentResponse(order.publicReference, order.status, lastTransaction.rawResponse);
      }

      const attempt =
        existingAttempt ?? (await tx.paymentAttempt.create({ data: { paymentOrderId: order.id, status: PaymentAttemptStatus.PENDING } }));

      if (order.status !== PaymentOrderStatus.PROCESSING && canTransitionOrderStatus(order.status, PaymentOrderStatus.PROCESSING)) {
        await tx.paymentOrder.update({ where: { id: order.id }, data: { status: PaymentOrderStatus.PROCESSING } });
      }

      let result;
      try {
        result = await this.paymentProvider.createPayment({
          publicReference: order.publicReference,
          amountCents: order.amountCents,
          currency: order.currency,
        });
      } catch (error) {
        this.logger.error(
          `Bold createPayment failed for reference ${publicReference}: ${(error as Error).message}`,
          BoldPaymentsService.name,
        );
        throw new ServiceUnavailableException(PROVIDER_UNAVAILABLE_MESSAGE);
      }

      const mapping = mapBoldPaymentStatus(result.status);
      if (!mapping.isKnownBoldStatus) {
        this.logger.warn(`Unknown Bold payment status "${result.status}" for reference ${publicReference}`, BoldPaymentsService.name);
      }

      let updatedAttempt = attempt;
      if (canTransitionAttemptStatus(attempt.status, mapping.attemptStatus)) {
        updatedAttempt = await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: mapping.attemptStatus } });
      } else {
        this.logger.warn(
          `Blocked invalid PaymentAttempt transition ${attempt.status} -> ${mapping.attemptStatus} for reference ${publicReference}`,
          BoldPaymentsService.name,
        );
      }

      const currentOrder = await tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      let updatedOrder = currentOrder;
      if (canTransitionOrderStatus(currentOrder.status, mapping.orderStatus)) {
        updatedOrder = await tx.paymentOrder.update({ where: { id: order.id }, data: { status: mapping.orderStatus } });
        await this.paymentReceiptsService.issueIfNewlyApproved(tx, currentOrder.status, updatedOrder);
      } else {
        this.logger.warn(
          `Blocked invalid PaymentOrder transition ${currentOrder.status} -> ${mapping.orderStatus} for reference ${publicReference}`,
          BoldPaymentsService.name,
        );
      }

      await tx.paymentTransaction.create({
        data: { paymentAttemptId: updatedAttempt.id, status: result.status, rawResponse: result.raw as Prisma.InputJsonValue },
      });

      await tx.paymentEvent.create({
        data: {
          paymentOrderId: updatedOrder.id,
          source: "bold",
          eventType: "payment.create",
          // Deterministic per-attempt key (not a Bold-supplied one - no
          // webhook is involved in this synchronous create call) so a
          // retried transaction can never write two create events for
          // the same attempt.
          idempotencyKey: `bold-create:${updatedAttempt.id}`,
          payload: result.raw as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });

      return toCreateBoldPaymentResponse(updatedOrder.publicReference, updatedOrder.status, result.raw);
    });
  }

  /**
   * US-025: GET /api/v1/payments/:reference/status. Only calls Bold
   * when the latest attempt is still unresolved (PENDING) - an order
   * with no attempt yet, or an attempt that already reached a terminal
   * status, is answered straight from the database ("avoid unnecessary
   * provider calls", PRD rule).
   */
  async getStatus(publicReference: string): Promise<BoldPaymentStatusResponse> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { publicReference } });
    if (!order) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const latestAttempt = await this.prisma.paymentAttempt.findFirst({
      where: { paymentOrderId: order.id },
      orderBy: { createdAt: "desc" },
    });

    if (!latestAttempt || isAttemptStatusTerminal(latestAttempt.status)) {
      return toBoldPaymentStatusResponse(order.publicReference, order.status, latestAttempt?.status ?? null);
    }

    let result;
    try {
      result = await this.paymentProvider.getPaymentStatus(order.publicReference);
    } catch (error) {
      this.logger.error(
        `Bold getPaymentStatus failed for reference ${publicReference}: ${(error as Error).message}`,
        BoldPaymentsService.name,
      );
      // The order/attempt stay exactly as they were - a transient
      // provider-status failure must never regress or invent a status.
      return toBoldPaymentStatusResponse(order.publicReference, order.status, latestAttempt.status);
    }

    const mapping = mapBoldPaymentStatus(result.status);
    if (!mapping.isKnownBoldStatus) {
      this.logger.warn(`Unknown Bold payment status "${result.status}" while polling reference ${publicReference}`, BoldPaymentsService.name);
    }

    const [finalOrder, finalAttempt] = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_orders WHERE id = ${order.id}::uuid FOR UPDATE`;

      const freshAttempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: latestAttempt.id } });
      let updatedAttempt = freshAttempt;
      if (canTransitionAttemptStatus(freshAttempt.status, mapping.attemptStatus)) {
        updatedAttempt = await tx.paymentAttempt.update({ where: { id: freshAttempt.id }, data: { status: mapping.attemptStatus } });
      } else {
        this.logger.warn(
          `Blocked invalid PaymentAttempt transition ${freshAttempt.status} -> ${mapping.attemptStatus} for reference ${publicReference}`,
          BoldPaymentsService.name,
        );
      }

      const freshOrder = await tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      let updatedOrder = freshOrder;
      if (canTransitionOrderStatus(freshOrder.status, mapping.orderStatus)) {
        updatedOrder = await tx.paymentOrder.update({ where: { id: order.id }, data: { status: mapping.orderStatus } });
        await this.paymentReceiptsService.issueIfNewlyApproved(tx, freshOrder.status, updatedOrder);
      } else {
        this.logger.warn(
          `Blocked invalid PaymentOrder transition ${freshOrder.status} -> ${mapping.orderStatus} for reference ${publicReference}`,
          BoldPaymentsService.name,
        );
      }

      await tx.paymentTransaction.create({
        data: { paymentAttemptId: updatedAttempt.id, status: result.status, rawResponse: result.raw as Prisma.InputJsonValue },
      });

      return [updatedOrder, updatedAttempt] as const;
    });

    return toBoldPaymentStatusResponse(finalOrder.publicReference, finalOrder.status, finalAttempt.status);
  }
}
