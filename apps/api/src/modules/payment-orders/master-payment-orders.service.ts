import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import type { RequestContext } from "../auth/auth.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import { MasterPaymentWriteClient, MasterPaymentWriteUnavailableError, type MasterProcedureRow } from "../master/firebird/master-payment-write.client";
import { MasterPaymentPreflightService } from "./master-payment-preflight.service";
import { generatePublicReference } from "./public-reference";
import type { PaymentOrderResponse } from "./payment-order.types";

const PAYMENT_TERMS_POLICY_SLUG = "terminos-de-pago";

export interface MasterPaymentOrderRow {
  id: string;
  public_reference: string;
  subject_ref: string;
  full_name: string;
  document_type: string;
  masked_document: string;
  contract_id: string;
  installment_id: string;
  concept: string;
  amount_cents: number;
  currency: "COP";
  due_date: Date;
  status: string;
  legacy_quote_id: string;
  legacy_state: string;
  provider_link_id: string | null;
  provider_checkout_url: string | null;
  provider_status: string | null;
  provider_transaction_id: string | null;
  provider_raw: unknown;
  reconciliation_result: string | null;
  master_receipt: string | null;
  master_document: string | null;
  failure_code: string | null;
  terms_version_id: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

function dateKey(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function masterMoneyToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function procedureResult(row: MasterProcedureRow): string {
  return String(row.RESULTADO ?? "").trim().toUpperCase();
}

@Injectable()
export class MasterPaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflight: MasterPaymentPreflightService,
    private readonly writer: MasterPaymentWriteClient,
    private readonly legalDocuments: LegalDocumentsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async create(selectionToken: string, context: RequestContext): Promise<PaymentOrderResponse> {
    const source = await this.preflight.verify(selectionToken);
    if (!source) throw new NotFoundException("No se encontraron resultados.");

    const created = await this.prisma.$transaction(async (tx) => {
      const lockKey = `${source.contractId}:${source.installmentId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET status = 'EXPIRED', updated_at = now()
        WHERE contract_id = ${source.contractId}
          AND installment_id = ${source.installmentId}
          AND status IN ('PENDING','PROCESSING')
          AND expires_at <= now()
      `;
      const existing = await tx.$queryRaw<MasterPaymentOrderRow[]>`
        SELECT * FROM legacy_bridge.master_payment_orders
        WHERE contract_id = ${source.contractId}
          AND installment_id = ${source.installmentId}
          AND status IN ('PENDING','PROCESSING')
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (existing[0]) return existing[0];

      const termsVersionId = await this.legalDocuments.resolveCurrentPublishedVersionId(PAYMENT_TERMS_POLICY_SLUG, tx);
      const id = randomUUID();
      const publicReference = generatePublicReference();
      const quoteId = randomUUID();
      const ttlMinutes = this.config.get("PAYMENT_ORDER_TTL_MINUTES", { infer: true });
      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
      const maskedDocument = source.document.length <= 4
        ? source.document
        : `${"•".repeat(source.document.length - 4)}${source.document.slice(-4)}`;

      await tx.$executeRaw`
        INSERT INTO legacy_bridge.master_payment_orders (
          id, public_reference, subject_ref, full_name, document_type, masked_document,
          contract_id, installment_id, concept, amount_cents, currency, due_date,
          status, legacy_quote_id, legacy_state, terms_version_id, acceptance_ip,
          acceptance_user_agent, expires_at
        ) VALUES (
          ${id}::uuid, ${publicReference}, ${source.personId}, ${source.fullName}, ${source.documentType}, ${maskedDocument},
          ${source.contractId}, ${source.installmentId}, ${source.concept}, ${source.amountCents}, 'COP', ${source.dueDate},
          'PENDING', ${quoteId}, 'QUOTE_PENDING', ${termsVersionId}::uuid, ${context.ipAddress ?? null},
          ${context.userAgent ?? null}, ${expiresAt}
        )
      `;
      await this.event(tx, id, "asodef", "master_order.created", `master-order:${id}`, {
        contractId: source.contractId,
        installmentId: source.installmentId,
        amountCents: source.amountCents,
      });
      return (await tx.$queryRaw<MasterPaymentOrderRow[]>`
        SELECT * FROM legacy_bridge.master_payment_orders WHERE id = ${id}::uuid
      `)[0]!;
    });

    const ready = await this.ensureOfficialQuote(created);
    return this.toPublic(ready);
  }

  async find(publicReference: string): Promise<MasterPaymentOrderRow | null> {
    const rows = await this.prisma.$queryRaw<MasterPaymentOrderRow[]>`
      SELECT * FROM legacy_bridge.master_payment_orders WHERE public_reference = ${publicReference} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findPublic(publicReference: string): Promise<PaymentOrderResponse | null> {
    const row = await this.find(publicReference);
    return row ? this.toPublic(row) : null;
  }

  toPublic(row: MasterPaymentOrderRow): PaymentOrderResponse {
    const labels: Record<string, string> = {
      PENDING: "Pendiente", PROCESSING: "Procesando", APPROVED: "Aprobado",
      REJECTED: "Rechazado", FAILED: "Fallido", EXPIRED: "Expirado", CANCELLED: "Cancelado",
    };
    return {
      publicReference: row.public_reference,
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      status: row.status,
      statusLabel: labels[row.status] ?? row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      obligation: { concept: row.concept, dueDate: row.due_date },
    };
  }

  async setProviderLink(orderId: string, linkId: string, checkoutUrl: string, raw: unknown): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET provider_link_id = ${linkId}, provider_checkout_url = ${checkoutUrl},
            provider_status = 'ACTIVE', provider_raw = ${JSON.stringify(raw)}::jsonb,
            status = 'PROCESSING', updated_at = now()
        WHERE id = ${orderId}::uuid
      `;
      await this.event(tx, orderId, "bold", "payment_link.created", `bold-link:${orderId}`, { linkId });
    });
  }

  async setProviderState(orderId: string, input: {
    providerStatus: string;
    orderStatus: string;
    transactionId?: string | null;
    raw: unknown;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE legacy_bridge.master_payment_orders
      SET provider_status = ${input.providerStatus}, status = ${input.orderStatus},
          provider_transaction_id = ${input.transactionId ?? null},
          provider_raw = ${JSON.stringify(input.raw)}::jsonb, updated_at = now()
      WHERE id = ${orderId}::uuid
    `;
  }

  async markApplied(orderId: string, reconcile: MasterProcedureRow): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET status = 'APPROVED', legacy_state = 'APPLIED_CONSISTENT',
            reconciliation_result = ${procedureResult(reconcile)},
            master_receipt = ${reconcile.NORECIBO_RESULTADO == null ? null : String(reconcile.NORECIBO_RESULTADO)},
            master_document = ${reconcile.NOFACTURA_RESULTADO == null ? null : String(reconcile.NOFACTURA_RESULTADO)},
            failure_code = NULL, updated_at = now()
        WHERE id = ${orderId}::uuid
      `;
      await this.event(tx, orderId, "master", "payment.applied", `master-applied:${orderId}`, {
        result: procedureResult(reconcile),
      });
    });
  }

  async markApplyRetry(orderId: string, code: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE legacy_bridge.master_payment_orders
      SET status = 'PROCESSING', legacy_state = 'APPLY_RETRY_REQUIRED', failure_code = ${code}, updated_at = now()
      WHERE id = ${orderId}::uuid
    `;
  }

  private async ensureOfficialQuote(row: MasterPaymentOrderRow): Promise<MasterPaymentOrderRow> {
    if (row.legacy_state === "QUOTE_READY") return row;
    let quote: MasterProcedureRow;
    try {
      quote = await this.writer.createQuote(row.legacy_quote_id, row.contract_id, row.public_reference);
    } catch (error) {
      await this.markApplyRetry(row.id, error instanceof MasterPaymentWriteUnavailableError ? error.message : "QUOTE_UNAVAILABLE");
      throw new ServiceUnavailableException("El pago en línea está temporalmente no disponible. Intenta nuevamente más tarde.");
    }
    const result = procedureResult(quote);
    if (result !== "QUOTE_CREATED" && result !== "ALREADY_EXISTS") {
      await this.cancel(row.id, `QUOTE_${result || "INVALID"}`);
      throw new ConflictException("Esta obligación no puede ser preparada para pago en este momento.");
    }
    const quoteCents = masterMoneyToCents(quote.VALOR_COTIZADO);
    const proposedDue = dateKey(quote.HASTA_PROPUESTO);
    if (quoteCents !== Number(row.amount_cents) || (proposedDue && proposedDue !== dateKey(row.due_date))) {
      await this.cancel(row.id, "QUOTE_SELECTION_MISMATCH");
      throw new ConflictException("Debes pagar primero la siguiente cuota habilitada por el sistema maestro.");
    }
    const quoteExpiry = quote.EXPIRES_AT ? new Date(String(quote.EXPIRES_AT)) : null;
    const effectiveExpiry = quoteExpiry && !Number.isNaN(quoteExpiry.getTime()) && quoteExpiry < row.expires_at ? quoteExpiry : row.expires_at;
    await this.prisma.$executeRaw`
      UPDATE legacy_bridge.master_payment_orders
      SET legacy_state = 'QUOTE_READY', failure_code = NULL, expires_at = ${effectiveExpiry}, updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
    return (await this.prisma.$queryRaw<MasterPaymentOrderRow[]>`
      SELECT * FROM legacy_bridge.master_payment_orders WHERE id = ${row.id}::uuid
    `)[0]!;
  }

  private async cancel(orderId: string, code: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE legacy_bridge.master_payment_orders
      SET status = 'CANCELLED', legacy_state = 'QUOTE_REJECTED', failure_code = ${code}, updated_at = now()
      WHERE id = ${orderId}::uuid
    `;
  }

  private async event(
    tx: Prisma.TransactionClient,
    orderId: string,
    source: string,
    eventType: string,
    idempotencyKey: string,
    payload: unknown,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO legacy_bridge.master_payment_events (id, order_id, source, event_type, idempotency_key, payload, processed_at)
      VALUES (${randomUUID()}::uuid, ${orderId}::uuid, ${source}, ${eventType}, ${idempotencyKey}, ${JSON.stringify(payload)}::jsonb, now())
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
  }
}
