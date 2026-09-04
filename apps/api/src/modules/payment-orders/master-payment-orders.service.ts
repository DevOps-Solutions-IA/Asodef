import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import type { RequestContext } from "../auth/auth.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
import { MasterPaymentPreflightService } from "./master-payment-preflight.service";
import { generatePublicReference } from "./public-reference";
import type { PaymentOrderResponse } from "./payment-order.types";

const PAYMENT_TERMS_POLICY_SLUG = "terminos-de-pago";

export type MasterPaymentOrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

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
  status: MasterPaymentOrderStatus;
  application_key: string;
  legacy_application_state: string;
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

export interface MasterPaymentOrderResponse extends PaymentOrderResponse {
  source: "master";
  providerStatus: string | null;
  legacyApplicationStatus: string;
}

function dateKey(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function sameSnapshot(
  row: Pick<MasterPaymentOrderRow, "amount_cents" | "due_date" | "subject_ref">,
  source: { amountCents: number; dueDate: Date; personId: string },
): boolean {
  return Number(row.amount_cents) === source.amountCents
    && dateKey(row.due_date) === dateKey(source.dueDate)
    && row.subject_ref === source.personId;
}

@Injectable()
export class MasterPaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preflight: MasterPaymentPreflightService,
    private readonly quotes: MasterPaymentQuoteService,
    private readonly legalDocuments: LegalDocumentsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async create(selectionToken: string, context: RequestContext): Promise<MasterPaymentOrderResponse> {
    // The browser supplies only the opaque selector. Amount, due date and
    // concept are re-read from the certified Master read boundary here.
    const source = await this.preflight.verify(selectionToken);
    if (!source) throw new NotFoundException("No se encontraron resultados.");

    const created = await this.prisma.$transaction(async (tx) => {
      const lockKey = `${source.contractId}:${source.installmentId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      // An untouched order may expire. A PROCESSING order is intentionally not
      // expired automatically because provider outcome may still be unknown.
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET status = 'EXPIRED', updated_at = now()
        WHERE contract_id = ${source.contractId}
          AND installment_id = ${source.installmentId}
          AND status = 'PENDING'
          AND provider_status IS NULL
          AND expires_at <= now()
      `;

      const existing = (await tx.$queryRaw<MasterPaymentOrderRow[]>`
        SELECT * FROM legacy_bridge.master_payment_orders
        WHERE contract_id = ${source.contractId}
          AND installment_id = ${source.installmentId}
          AND status IN ('PENDING','PROCESSING')
          AND (status = 'PROCESSING' OR expires_at > now())
        ORDER BY created_at DESC
        LIMIT 1
      `)[0];

      if (existing) {
        if (sameSnapshot(existing, source)) return existing;
        if (existing.status === "PROCESSING" || existing.provider_status !== null) {
          throw new ConflictException("Existe un cobro en curso para esta cuota y requiere conciliación antes de crear otra orden.");
        }
        await tx.$executeRaw`
          UPDATE legacy_bridge.master_payment_orders
          SET status = 'EXPIRED', failure_code = 'MASTER_SNAPSHOT_CHANGED', updated_at = now()
          WHERE id = ${existing.id}::uuid AND status = 'PENDING' AND provider_status IS NULL
        `;
      }

      const termsVersionId = await this.legalDocuments.resolveCurrentPublishedVersionId(PAYMENT_TERMS_POLICY_SLUG, tx);
      const id = randomUUID();
      const applicationKey = randomUUID();
      const publicReference = generatePublicReference();
      const ttlMinutes = this.config.get("PAYMENT_ORDER_TTL_MINUTES", { infer: true });
      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
      const maskedDocument = source.document.length <= 4
        ? source.document
        : `${"•".repeat(source.document.length - 4)}${source.document.slice(-4)}`;

      await tx.$executeRaw`
        INSERT INTO legacy_bridge.master_payment_orders (
          id, public_reference, subject_ref, full_name, document_type, masked_document,
          contract_id, installment_id, concept, amount_cents, currency, due_date,
          status, application_key, legacy_application_state, terms_version_id, acceptance_ip,
          acceptance_user_agent, expires_at
        ) VALUES (
          ${id}::uuid, ${publicReference}, ${source.personId}, ${source.fullName}, ${source.documentType}, ${maskedDocument},
          ${source.contractId}, ${source.installmentId}, ${source.concept}, ${source.amountCents}, 'COP', ${source.dueDate},
          'PENDING', ${applicationKey}, 'NOT_APPLIED', ${termsVersionId}::uuid, ${context.ipAddress ?? null},
          ${context.userAgent ?? null}, ${expiresAt}
        )
      `;
      await this.event(tx, id, "asodef", "master_order.created", `master-order:${id}`, {
        source: "master",
        contractId: source.contractId,
        installmentId: source.installmentId,
        amountCents: source.amountCents,
        dueDate: source.dueDate.toISOString(),
      });
      return (await tx.$queryRaw<MasterPaymentOrderRow[]>`
        SELECT * FROM legacy_bridge.master_payment_orders WHERE id = ${id}::uuid
      `)[0]!;
    });

    return this.toPublic(created);
  }

  async find(publicReference: string): Promise<MasterPaymentOrderRow | null> {
    const rows = await this.prisma.$queryRaw<MasterPaymentOrderRow[]>`
      SELECT * FROM legacy_bridge.master_payment_orders WHERE public_reference = ${publicReference} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findPublic(publicReference: string): Promise<MasterPaymentOrderResponse | null> {
    const row = await this.find(publicReference);
    return row ? this.toPublic(row) : null;
  }

  async revalidateForCheckout(order: MasterPaymentOrderRow): Promise<void> {
    let quote;
    try {
      quote = await this.quotes.quote(order.subject_ref, order.contract_id, order.installment_id);
    } catch {
      throw new ServiceUnavailableException("No fue posible verificar el saldo en el sistema maestro.");
    }

    if (quote.status !== "VERIFIED") {
      await this.cancelUnstarted(order.id, "MASTER_SELECTION_NOT_PAYABLE");
      throw new ConflictException("La cuota ya no está habilitada para pago.");
    }
    if (quote.data.amountCents !== Number(order.amount_cents) || dateKey(quote.data.dueDate) !== dateKey(order.due_date)) {
      await this.cancelUnstarted(order.id, "MASTER_SNAPSHOT_CHANGED");
      throw new ConflictException("El saldo cambió. Consulta nuevamente antes de pagar.");
    }
  }

  async claimProviderCreate(orderId: string): Promise<MasterPaymentOrderRow | null> {
    const rows = await this.prisma.$queryRaw<MasterPaymentOrderRow[]>`
      UPDATE legacy_bridge.master_payment_orders
      SET status = 'PROCESSING', provider_status = 'CREATE_CLAIMED', updated_at = now()
      WHERE id = ${orderId}::uuid
        AND status = 'PENDING'
        AND provider_status IS NULL
        AND expires_at > now()
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async recordProviderResult(orderId: string, input: {
    providerStatus: string;
    orderStatus: "PROCESSING" | "REJECTED";
    providerConfirmed: boolean;
    raw: unknown;
    eventType: "payment.create" | "payment.status";
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET provider_status = ${input.providerStatus},
            provider_raw = ${JSON.stringify(input.raw)}::jsonb,
            status = ${input.orderStatus},
            legacy_application_state = CASE
              WHEN ${input.providerConfirmed} THEN 'PENDING_WRITE_BRIDGE'
              ELSE legacy_application_state
            END,
            failure_code = NULL,
            updated_at = now()
        WHERE id = ${orderId}::uuid
      `;
      await this.event(
        tx,
        orderId,
        "bold",
        input.eventType,
        `${input.eventType}:${orderId}:${input.providerStatus}`,
        { providerStatus: input.providerStatus, providerConfirmed: input.providerConfirmed, raw: input.raw },
      );
    });
  }

  async markProviderCreateUnknown(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE legacy_bridge.master_payment_orders
        SET status = 'PROCESSING', provider_status = 'CREATE_UNKNOWN',
            failure_code = 'BOLD_CREATE_OUTCOME_UNKNOWN', updated_at = now()
        WHERE id = ${orderId}::uuid
      `;
      await this.event(tx, orderId, "bold", "payment.create_unknown", `bold-create-unknown:${orderId}`, {});
    });
  }

  toPublic(row: MasterPaymentOrderRow): MasterPaymentOrderResponse {
    const labels: Record<MasterPaymentOrderStatus, string> = {
      PENDING: "Pendiente",
      PROCESSING: "Procesando",
      APPROVED: "Aprobado",
      REJECTED: "Rechazado",
      FAILED: "Fallido",
      EXPIRED: "Expirado",
      CANCELLED: "Cancelado",
    };
    return {
      source: "master",
      publicReference: row.public_reference,
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      status: row.status,
      statusLabel: labels[row.status],
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      providerStatus: row.provider_status,
      legacyApplicationStatus: row.legacy_application_state,
      obligation: { concept: row.concept, dueDate: row.due_date },
    };
  }

  private async cancelUnstarted(orderId: string, code: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE legacy_bridge.master_payment_orders
      SET status = 'CANCELLED', failure_code = ${code}, updated_at = now()
      WHERE id = ${orderId}::uuid AND status = 'PENDING' AND provider_status IS NULL
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
