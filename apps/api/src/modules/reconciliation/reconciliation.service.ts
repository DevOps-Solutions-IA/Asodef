import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReconciliationDifferenceKind, ReconciliationResolutionStatus, type PaymentEvent } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { mapBoldPaymentStatus } from "../bold-payments/bold-payment-status-mapping";
import { isValidBoldWebhookPayload } from "../webhooks/bold-webhook-payload";
import type { RunReconciliationDto } from "./dto/run-reconciliation.dto";
import type { ResolveDifferenceDto } from "./dto/resolve-difference.dto";
import {
  toAdminReconciliationDifferenceResponse,
  toAdminReconciliationResponse,
  type AdminReconciliationDifferenceResponse,
  type AdminReconciliationResponse,
} from "./reconciliation.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

/** Order statuses that already reflect a provider approval having
 * landed - anything else (DRAFT/PENDING/PROCESSING/REJECTED/FAILED/
 * EXPIRED/CANCELLED) counts as "not yet approved internally" for
 * reconciliation purposes. */
const ORDER_STATUSES_REFLECTING_APPROVAL = ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED"];

interface CandidateDifference {
  paymentOrderId: string | null;
  kind: ReconciliationDifferenceKind;
  details: Prisma.InputJsonValue;
}

/**
 * US-057. Compares PaymentOrder/PaymentEvent/PaymentTransaction/
 * PaymentReceipt/Refund records for a date range and persists any of
 * the AC's 7 literal mismatch kinds found. Detection is deliberately
 * scoped to data this project actually has confirmed shapes for -
 * amount-mismatch, for instance, compares an order's own amountCents
 * against its originating obligation's (not a Bold-reported amount
 * field, since Bold's raw response shape has no confirmed amount
 * field anywhere in this project's approved sources - only `status`
 * is confirmed, see payment-provider.interface.ts).
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async run(dto: RunReconciliationDto, actorUserId: string): Promise<AdminReconciliationResponse> {
    const rangeStart = new Date(dto.rangeStart);
    const rangeEnd = new Date(dto.rangeEnd);

    const candidates: CandidateDifference[] = [];
    const flaggedEventIds = new Set<string>();

    const events = await this.prisma.paymentEvent.findMany({
      where: { receivedAt: { gte: rangeStart, lte: rangeEnd } },
      include: { paymentOrder: true },
    });

    // provider-approved-internally-pending + reference-mismatch: both
    // detected per-event, checked first so unprocessed-notification
    // below doesn't double-flag the same root cause.
    for (const event of events) {
      if (!isValidBoldWebhookPayload(event.payload)) continue;

      const mapping = mapBoldPaymentStatus(event.payload.status);
      if (mapping.orderStatus === "APPROVED" && !ORDER_STATUSES_REFLECTING_APPROVAL.includes(event.paymentOrder.status)) {
        candidates.push({
          paymentOrderId: event.paymentOrderId,
          kind: ReconciliationDifferenceKind.PROVIDER_APPROVED_INTERNALLY_PENDING,
          details: { eventId: event.id, providerStatus: event.payload.status, orderStatus: event.paymentOrder.status },
        });
        flaggedEventIds.add(event.id);
      }

      if (event.payload.reference_id !== event.paymentOrder.publicReference) {
        candidates.push({
          paymentOrderId: event.paymentOrderId,
          kind: ReconciliationDifferenceKind.REFERENCE_MISMATCH,
          details: { eventId: event.id, payloadReference: event.payload.reference_id, orderReference: event.paymentOrder.publicReference },
        });
        flaggedEventIds.add(event.id);
      }
    }

    // unprocessed-notification: only events not already explained by a
    // more specific kind above.
    for (const event of events) {
      if (event.processedAt === null && !flaggedEventIds.has(event.id)) {
        candidates.push({
          paymentOrderId: event.paymentOrderId,
          kind: ReconciliationDifferenceKind.UNPROCESSED_NOTIFICATION,
          details: { eventId: event.id, receivedAt: event.receivedAt },
        });
      }
    }

    // duplicate-event: 2+ distinct events for the same order reporting
    // the identical raw provider status (idempotencyKey already blocks
    // literal duplicate webhook deliveries - this catches genuinely
    // distinct event rows, e.g. webhook + poll, reporting the same
    // outcome redundantly).
    const eventsByOrder = new Map<string, PaymentEvent[]>();
    for (const event of events) {
      const list = eventsByOrder.get(event.paymentOrderId) ?? [];
      list.push(event);
      eventsByOrder.set(event.paymentOrderId, list);
    }
    for (const [orderId, orderEvents] of eventsByOrder) {
      const idsByStatus = new Map<string, string[]>();
      for (const event of orderEvents) {
        if (!isValidBoldWebhookPayload(event.payload)) continue;
        const ids = idsByStatus.get(event.payload.status) ?? [];
        ids.push(event.id);
        idsByStatus.set(event.payload.status, ids);
      }
      for (const [status, ids] of idsByStatus) {
        if (ids.length > 1) {
          candidates.push({
            paymentOrderId: orderId,
            kind: ReconciliationDifferenceKind.DUPLICATE_EVENT,
            details: { eventIds: ids, status },
          });
        }
      }
    }

    // internal-approved-no-provider-confirmation: an order that reached
    // APPROVED (or beyond) with no on-record event whose mapped status
    // is APPROVED.
    const approvedOrders = await this.prisma.paymentOrder.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd }, status: { in: ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED"] } },
      include: { events: true },
    });
    for (const order of approvedOrders) {
      const hasApprovalEvent = order.events.some(
        (event) => isValidBoldWebhookPayload(event.payload) && mapBoldPaymentStatus(event.payload.status).orderStatus === "APPROVED",
      );
      if (!hasApprovalEvent) {
        candidates.push({
          paymentOrderId: order.id,
          kind: ReconciliationDifferenceKind.INTERNAL_APPROVED_NO_PROVIDER_CONFIRMATION,
          details: { orderStatus: order.status },
        });
      }
    }

    // amount-mismatch: an order's amount must always equal its
    // originating obligation's amount (payment-orders.service.ts's own
    // create() always copies it verbatim) - a mismatch here can only
    // mean a data-integrity problem, not normal drift.
    const ordersInRange = await this.prisma.paymentOrder.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      include: { obligation: true },
    });
    for (const order of ordersInRange) {
      if (order.amountCents !== order.obligation.amountCents) {
        candidates.push({
          paymentOrderId: order.id,
          kind: ReconciliationDifferenceKind.AMOUNT_MISMATCH,
          details: { orderAmountCents: order.amountCents, obligationAmountCents: order.obligation.amountCents },
        });
      }
    }

    // refund-inconsistency: an APPROVED refund whose order doesn't (or
    // no longer) reflects a REFUNDED/PARTIALLY_REFUNDED status.
    const refunds = await this.prisma.refund.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd }, status: "APPROVED" },
      include: { paymentOrder: true },
    });
    for (const refund of refunds) {
      if (!["REFUNDED", "PARTIALLY_REFUNDED"].includes(refund.paymentOrder.status)) {
        candidates.push({
          paymentOrderId: refund.paymentOrderId,
          kind: ReconciliationDifferenceKind.REFUND_INCONSISTENCY,
          details: { refundId: refund.id, refundStatus: refund.status, orderStatus: refund.paymentOrder.status },
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.reconciliation.create({
        data: { rangeStart, rangeEnd, responsibleUserId: actorUserId, notes: dto.notes },
      });

      let createdCount = 0;
      for (const candidate of candidates) {
        // De-dupe (Negative case AC): skip if a difference for this
        // exact (order, kind) pair already exists from any prior run,
        // resolved or not - (paymentOrderId, kind) is this issue's
        // stable identity across runs.
        const existing = candidate.paymentOrderId
          ? await tx.reconciliationDifference.findUnique({
              where: { paymentOrderId_kind: { paymentOrderId: candidate.paymentOrderId, kind: candidate.kind } },
            })
          : null;
        if (existing) continue;

        await tx.reconciliationDifference.create({
          data: {
            reconciliationId: run.id,
            paymentOrderId: candidate.paymentOrderId,
            kind: candidate.kind,
            details: candidate.details,
          },
        });
        createdCount += 1;
      }

      const updated = await tx.reconciliation.update({ where: { id: run.id }, data: { differencesFound: createdCount } });
      return toAdminReconciliationResponse(updated);
    });
  }

  async getRun(id: string): Promise<AdminReconciliationResponse> {
    const run = await this.prisma.reconciliation.findUnique({ where: { id } });
    if (!run) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminReconciliationResponse(run);
  }

  async listRuns(): Promise<AdminReconciliationResponse[]> {
    const runs = await this.prisma.reconciliation.findMany({ orderBy: { createdAt: "desc" } });
    return runs.map(toAdminReconciliationResponse);
  }

  async listDifferences(reconciliationId: string): Promise<AdminReconciliationDifferenceResponse[]> {
    const differences = await this.prisma.reconciliationDifference.findMany({ where: { reconciliationId }, orderBy: { createdAt: "asc" } });
    return differences.map(toAdminReconciliationDifferenceResponse);
  }

  async resolveDifference(id: string, dto: ResolveDifferenceDto, actorUserId: string): Promise<AdminReconciliationDifferenceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const difference = await tx.reconciliationDifference.findUnique({ where: { id } });
      if (!difference) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }
      if (difference.resolutionStatus === ReconciliationResolutionStatus.RESOLVED) {
        throw new ConflictException("Esta diferencia ya fue resuelta.");
      }

      const updated = await tx.reconciliationDifference.update({
        where: { id },
        data: {
          resolutionStatus: ReconciliationResolutionStatus.RESOLVED,
          resolutionNotes: dto.resolutionNotes,
          resolvedByUserId: actorUserId,
          resolvedAt: new Date(),
        },
      });

      const remainingOpen = await tx.reconciliationDifference.count({
        where: { reconciliationId: difference.reconciliationId, resolutionStatus: ReconciliationResolutionStatus.OPEN },
      });
      if (remainingOpen === 0) {
        await tx.reconciliation.update({
          where: { id: difference.reconciliationId },
          data: { resolutionStatus: ReconciliationResolutionStatus.RESOLVED },
        });
      }

      return toAdminReconciliationDifferenceResponse(updated);
    });
  }
}
