import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ReconciliationDifferenceKind, ReconciliationResolutionStatus, type PaymentEvent } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { mapBoldPaymentStatus } from "../bold-payments/bold-payment-status-mapping";
import { normalizeBoldWebhookPayload } from "../webhooks/bold-webhook-payload";
import type { RunReconciliationDto } from "./dto/run-reconciliation.dto";
import type { ResolveDifferenceDto } from "./dto/resolve-difference.dto";
import {
  toAdminReconciliationDifferenceResponse,
  toAdminReconciliationResponse,
  type AdminReconciliationDifferenceResponse,
  type AdminReconciliationResponse,
} from "./reconciliation.types";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";
const ORDER_STATUSES_REFLECTING_APPROVAL = ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED"];

interface CandidateDifference {
  paymentOrderId: string | null;
  kind: ReconciliationDifferenceKind;
  details: Prisma.InputJsonValue;
}

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

    // Both the current official Bold payload and the retained mock/legacy
    // payload are normalized before reconciliation. The raw event stays
    // untouched in PaymentEvent.payload.
    for (const event of events) {
      const normalized = normalizeBoldWebhookPayload(event.payload);
      if (!normalized) continue;

      if (normalized.providerStatus) {
        const mapping = mapBoldPaymentStatus(normalized.providerStatus);
        if (mapping.orderStatus === "APPROVED" && !ORDER_STATUSES_REFLECTING_APPROVAL.includes(event.paymentOrder.status)) {
          candidates.push({
            paymentOrderId: event.paymentOrderId,
            kind: ReconciliationDifferenceKind.PROVIDER_APPROVED_INTERNALLY_PENDING,
            details: {
              eventId: event.id,
              providerStatus: normalized.providerStatus,
              orderStatus: event.paymentOrder.status,
            },
          });
          flaggedEventIds.add(event.id);
        }
      }

      if (normalized.reference && normalized.reference !== event.paymentOrder.publicReference) {
        candidates.push({
          paymentOrderId: event.paymentOrderId,
          kind: ReconciliationDifferenceKind.REFERENCE_MISMATCH,
          details: {
            eventId: event.id,
            payloadReference: normalized.reference,
            orderReference: event.paymentOrder.publicReference,
          },
        });
        flaggedEventIds.add(event.id);
      }
    }

    for (const event of events) {
      if (event.processedAt === null && !flaggedEventIds.has(event.id)) {
        candidates.push({
          paymentOrderId: event.paymentOrderId,
          kind: ReconciliationDifferenceKind.UNPROCESSED_NOTIFICATION,
          details: { eventId: event.id, receivedAt: event.receivedAt },
        });
      }
    }

    const eventsByOrder = new Map<string, PaymentEvent[]>();
    for (const event of events) {
      const list = eventsByOrder.get(event.paymentOrderId) ?? [];
      list.push(event);
      eventsByOrder.set(event.paymentOrderId, list);
    }
    for (const [orderId, orderEvents] of eventsByOrder) {
      const idsByProviderOutcome = new Map<string, string[]>();
      for (const event of orderEvents) {
        const normalized = normalizeBoldWebhookPayload(event.payload);
        if (!normalized) continue;
        const outcome = normalized.providerStatus ?? normalized.eventType;
        const ids = idsByProviderOutcome.get(outcome) ?? [];
        ids.push(event.id);
        idsByProviderOutcome.set(outcome, ids);
      }
      for (const [status, ids] of idsByProviderOutcome) {
        if (ids.length > 1) {
          candidates.push({
            paymentOrderId: orderId,
            kind: ReconciliationDifferenceKind.DUPLICATE_EVENT,
            details: { eventIds: ids, status },
          });
        }
      }
    }

    const approvedOrders = await this.prisma.paymentOrder.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd }, status: { in: ["APPROVED", "REFUNDED", "PARTIALLY_REFUNDED"] } },
      include: { events: true },
    });
    for (const order of approvedOrders) {
      const hasApprovalEvent = order.events.some((event) => {
        const normalized = normalizeBoldWebhookPayload(event.payload);
        return normalized?.providerStatus
          ? mapBoldPaymentStatus(normalized.providerStatus).orderStatus === "APPROVED"
          : false;
      });
      if (!hasApprovalEvent) {
        candidates.push({
          paymentOrderId: order.id,
          kind: ReconciliationDifferenceKind.INTERNAL_APPROVED_NO_PROVIDER_CONFIRMATION,
          details: { orderStatus: order.status },
        });
      }
    }

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
    if (!run) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    return toAdminReconciliationResponse(run);
  }

  async listRuns(): Promise<AdminReconciliationResponse[]> {
    const runs = await this.prisma.reconciliation.findMany({ orderBy: { createdAt: "desc" } });
    return runs.map(toAdminReconciliationResponse);
  }

  async listDifferences(reconciliationId: string): Promise<AdminReconciliationDifferenceResponse[]> {
    const differences = await this.prisma.reconciliationDifference.findMany({
      where: { reconciliationId },
      orderBy: { createdAt: "asc" },
    });
    return differences.map(toAdminReconciliationDifferenceResponse);
  }

  async resolveDifference(id: string, dto: ResolveDifferenceDto, actorUserId: string): Promise<AdminReconciliationDifferenceResponse> {
    return this.prisma.$transaction(async (tx) => {
      const difference = await tx.reconciliationDifference.findUnique({ where: { id } });
      if (!difference) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
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
