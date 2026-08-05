import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Obligation, PaymentOrder } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { AuditService, AuditSource } from "../audit/audit.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import { ConsentService } from "../consent/consent.service";
import type { RequestContext } from "../auth/auth.service";
import { generatePublicReference } from "./public-reference";

const PAYMENT_TERMS_POLICY_SLUG = "terminos-de-pago";

/** Obligation statuses that still represent money owed - anything else
 * (PAID, CANCELLED) is not payable. Matches the AC's own "outstanding"
 * wording; the literal negative case only tests PAID, CANCELLED is the
 * same non-inventive extension of "not outstanding". Exported so
 * PaymentsLookupService (also US-024) filters obligations the same way,
 * rather than duplicating this list. */
export const OUTSTANDING_OBLIGATION_STATUSES = ["PENDING", "OVERDUE"] as const;

export type PaymentOrderWithObligation = PaymentOrder & { obligation: Pick<Obligation, "concept" | "dueDate"> };

interface ObligationRow {
  id: string;
  customer_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  concept: string;
  due_date: Date;
}

@Injectable()
export class PaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly auditService: AuditService,
    private readonly legalDocumentsService: LegalDocumentsService,
    private readonly consentService: ConsentService,
  ) {}

  /**
   * Creates (or reuses) the PaymentOrder for a given Obligation.
   * Amount/currency are always read from the Obligation row itself -
   * this method takes no amount parameter at all, so there is no
   * client-supplied figure to ever trust or validate against.
   *
   * Concurrency: `SELECT ... FOR UPDATE` locks the Obligation row for
   * the duration of the transaction, so two concurrent create() calls
   * for the *same* obligationId serialize here - the second call's
   * SELECT blocks until the first transaction commits, then sees its
   * already-created PENDING order and reuses it instead of creating a
   * second one. Prisma has no first-class row-locking API, hence the
   * raw SQL for this one query; everything else uses the normal client.
   */
  async create(obligationId: string, context: RequestContext): Promise<PaymentOrderWithObligation> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ObligationRow[]>`
        SELECT id, customer_id, status, amount_cents, currency, concept, due_date
        FROM obligations
        WHERE id = ${obligationId}::uuid
        FOR UPDATE
      `;
      const obligation = rows[0];

      if (!obligation) {
        throw new NotFoundException("La obligación indicada no existe.");
      }
      if (!(OUTSTANDING_OBLIGATION_STATUSES as readonly string[]).includes(obligation.status)) {
        throw new ConflictException("Esta obligación ya no está pendiente de pago.");
      }

      const existingOrder = await tx.paymentOrder.findFirst({
        where: { obligationId, status: "PENDING", expiresAt: { gt: new Date() } },
      });
      if (existingOrder) {
        return { ...existingOrder, obligation: { concept: obligation.concept, dueDate: obligation.due_date } };
      }

      const ttlMinutes = this.configService.get("PAYMENT_ORDER_TTL_MINUTES", { infer: true });
      const created = await tx.paymentOrder.create({
        data: {
          publicReference: generatePublicReference(),
          obligationId: obligation.id,
          customerId: obligation.customer_id,
          amountCents: obligation.amount_cents,
          currency: obligation.currency,
          status: "PENDING",
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
        },
      });

      await this.auditService.record(tx, {
        paymentOrderId: created.id,
        action: "order.created",
        previousStatus: null,
        newStatus: created.status,
        applied: true,
        source: AuditSource.ORDER_CREATE,
      });

      // US-046: proceeding to create a payment order is the customer's
      // acceptance of the payment terms in effect right now - recorded
      // as durable evidence, not just implied. Only on the genuinely
      // new-order branch (not the reuse-existing-PENDING-order branch
      // above), matching how the audit entry above is also only written
      // here. payment_terms requires a resolvable policy version, so
      // this correctly fails closed (no order created) while nothing is
      // published yet - see the identical note on LeadsService.create.
      const policyVersionId = await this.legalDocumentsService.resolveCurrentPublishedVersionId(PAYMENT_TERMS_POLICY_SLUG, tx);
      await this.consentService.record(tx, "payment_terms", { customerId: obligation.customer_id }, policyVersionId, {
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        source: "web_payment_order",
        acceptanceMethod: "implicit_action",
      });

      return { ...created, obligation: { concept: obligation.concept, dueDate: obligation.due_date } };
    });
  }

  /** Public-reference lookup for GET /payment-orders/:reference - never
   * accepts or looks up by the internal id. */
  async findByPublicReference(publicReference: string): Promise<PaymentOrderWithObligation | null> {
    return this.prisma.paymentOrder.findUnique({
      where: { publicReference },
      include: { obligation: { select: { concept: true, dueDate: true } } },
    });
  }
}
