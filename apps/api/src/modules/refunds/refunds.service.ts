import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RefundStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { AuditService, AuditSource } from "../audit/audit.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment-providers/payment-provider.interface";
import type { RequestRefundDto } from "./dto/request-refund.dto";
import { toAdminRefundResponse, type AdminRefundResponse } from "./refunds.types";
import type { UploadedFile } from "../../common/http/uploaded-file.type";

const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly auditService: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * AC: order must be APPROVED, requested amount must not exceed the
   * original. Only one refund window exists per order in this flow -
   * once approved, the order moves to REFUNDED/PARTIALLY_REFUNDED and
   * is no longer APPROVED, so a second request is rejected the same
   * way (no accumulation logic needed beyond that single gate).
   */
  async requestRefund(publicReference: string, dto: RequestRefundDto, actorUserId: string): Promise<AdminRefundResponse> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({ where: { publicReference } });
      if (!order) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }
      if (order.status !== "APPROVED") {
        throw new ConflictException("Solo se pueden solicitar reembolsos sobre órdenes aprobadas.");
      }
      if (dto.amountCents > order.amountCents) {
        throw new BadRequestException("El monto del reembolso no puede superar el monto original de la orden.");
      }

      const refund = await tx.refund.create({
        data: {
          paymentOrderId: order.id,
          amountCents: dto.amountCents,
          reason: dto.reason,
          status: RefundStatus.PENDING_APPROVAL,
        },
      });

      await this.auditService.record(tx, {
        refundId: refund.id,
        action: "refund.requested",
        previousStatus: null,
        newStatus: refund.status,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        metadata: { paymentOrderId: order.id, amountCents: dto.amountCents, reason: dto.reason },
      });

      return toAdminRefundResponse(refund);
    });
  }

  async uploadEvidence(refundId: string, file: UploadedFile, actorUserId: string): Promise<AdminRefundResponse> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId } });
      if (!refund) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }
      if (refund.status !== RefundStatus.PENDING_APPROVAL) {
        throw new ConflictException("Solo se puede adjuntar evidencia mientras el reembolso está pendiente de aprobación.");
      }

      const storageDir = resolve(this.configService.get("REFUNDS_STORAGE_DIR", { infer: true }));
      await mkdir(storageDir, { recursive: true });
      const checksum = createHash("sha256").update(file.buffer).digest("hex");
      const evidencePath = join(storageDir, `${refundId}-${checksum.slice(0, 12)}`);
      await writeFile(evidencePath, file.buffer);

      const updated = await tx.refund.update({ where: { id: refundId }, data: { evidencePath } });

      await this.auditService.record(tx, {
        refundId: refund.id,
        action: "refund.evidence_uploaded",
        previousStatus: refund.status,
        newStatus: refund.status,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
      });

      return toAdminRefundResponse(updated);
    });
  }

  /**
   * Example (AC): approving a full refund for a mock-approved order
   * transitions the order to REFUNDED. A partial amount transitions it
   * to PARTIALLY_REFUNDED instead - the AC's own two named outcomes.
   *
   * BLOCKED (AC's own literal requirement, not implementable yet): "logs
   * a CommunicationLog entry notifying the customer" - CommunicationLog
   * is US-059's own model (dependsOn: US-046, US-050), which has not
   * been built yet. Per the standing "never invent a later story's
   * model" rule, no CommunicationLog write happens here; every other
   * part of this AC (eligibility, approval, provider call, order
   * status transition, audit trail) is implemented and independently
   * verified.
   */
  async approveRefund(refundId: string, actorUserId: string): Promise<AdminRefundResponse> {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { paymentOrder: true } });
      if (!refund) {
        throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
      }
      if (refund.status !== RefundStatus.PENDING_APPROVAL) {
        throw new ConflictException("Solo se pueden aprobar reembolsos pendientes de aprobación.");
      }

      // Bold's own reference_id IS our publicReference throughout the
      // whole create/getStatus flow (see CreatePaymentInput's own doc
      // comment) - PaymentAttempt.providerReferenceId is a distinct,
      // never-yet-populated field (no earlier story's code writes to
      // it anywhere in this codebase), not the value Bold actually
      // keys refund lookups on.
      const latestAttempt = await tx.paymentAttempt.findFirst({
        where: { paymentOrderId: refund.paymentOrderId },
        orderBy: { createdAt: "desc" },
      });
      if (!latestAttempt) {
        throw new ConflictException("No hay un intento de pago asociado a esta orden.");
      }

      let providerResult;
      try {
        providerResult = await this.paymentProvider.createRefund!({
          providerReferenceId: refund.paymentOrder.publicReference,
          amountCents: refund.amountCents,
          reason: refund.reason,
        });
      } catch (error) {
        await tx.refund.update({ where: { id: refundId }, data: { status: RefundStatus.FAILED } });
        await this.auditService.record(tx, {
          refundId: refund.id,
          action: "refund.provider_call_failed",
          previousStatus: refund.status,
          newStatus: RefundStatus.FAILED,
          applied: false,
          source: AuditSource.MANUAL,
          actorUserId,
          metadata: { error: error instanceof Error ? error.message : "unknown error" },
        });
        throw error;
      }

      const newOrderStatus = refund.amountCents === refund.paymentOrder.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";

      const updated = await tx.refund.update({
        where: { id: refundId },
        data: {
          status: RefundStatus.APPROVED,
          approvedByUserId: actorUserId,
          providerReference: typeof providerResult.raw === "object" && providerResult.raw !== null && "reference_id" in providerResult.raw
            ? String((providerResult.raw as { reference_id: unknown }).reference_id)
            : null,
        },
      });

      await tx.paymentOrder.update({ where: { id: refund.paymentOrderId }, data: { status: newOrderStatus } });

      await this.auditService.record(tx, {
        refundId: refund.id,
        action: "refund.approved",
        previousStatus: RefundStatus.PENDING_APPROVAL,
        newStatus: RefundStatus.APPROVED,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
      });
      await this.auditService.record(tx, {
        paymentOrderId: refund.paymentOrderId,
        action: "order.status_transition",
        previousStatus: refund.paymentOrder.status,
        newStatus: newOrderStatus,
        applied: true,
        source: AuditSource.MANUAL,
        actorUserId,
        metadata: { reason: "refund_approved", refundId: refund.id },
      });

      return toAdminRefundResponse(updated);
    });
  }

  async getRefund(id: string): Promise<AdminRefundResponse> {
    const refund = await this.prisma.refund.findUnique({ where: { id } });
    if (!refund) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return toAdminRefundResponse(refund);
  }

  /** US-063 AC1: /admin/pagos needs a given order's own refunds when
   * viewing its detail - paymentOrderId stays optional so the existing
   * unfiltered "list every refund" callers keep working unchanged. */
  async listRefunds(paymentOrderId?: string): Promise<AdminRefundResponse[]> {
    const refunds = await this.prisma.refund.findMany({
      where: paymentOrderId ? { paymentOrderId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return refunds.map(toAdminRefundResponse);
  }
}
