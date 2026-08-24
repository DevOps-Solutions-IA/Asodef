import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Obligation, PaymentOrder, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { AuditService, AuditSource } from "../audit/audit.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import { ConsentService } from "../consent/consent.service";
import type { RequestContext } from "../auth/auth.service";
import { generatePublicReference } from "./public-reference";
import { toPrePaymentDisclosureResponse, type PrePaymentDisclosureResponse } from "./plan-disclosure.types";
import {
  toAdminPaymentOrderResponse,
  type AdminPaymentEventResponse,
  type AdminPaymentOrderListResponse,
  type AdminPaymentOrderResponse,
} from "./admin-payment-order.types";
import type { SearchPaymentOrdersQueryDto } from "./dto/search-payment-orders-query.dto";

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
  plan_id: string;
  // Null when the plan has no current_version_id set at all (never
  // configured yet) - distinct from "has a version but it isn't ACTIVE".
  plan_version_id: string | null;
  plan_version_status: string | null;
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
        SELECT
          o.id, o.customer_id, o.status, o.amount_cents, o.currency, o.concept, o.due_date,
          o.plan_id, p.current_version_id AS plan_version_id, pv.status AS plan_version_status
        FROM obligations o
        JOIN plans p ON p.id = o.plan_id
        LEFT JOIN plan_versions pv ON pv.id = p.current_version_id
        WHERE o.id = ${obligationId}::uuid
        FOR UPDATE OF o
      `;
      const obligation = rows[0];

      if (!obligation) {
        throw new NotFoundException("La obligación indicada no existe.");
      }
      if (!(OUTSTANDING_OBLIGATION_STATUSES as readonly string[]).includes(obligation.status)) {
        throw new ConflictException("Esta obligación ya no está pendiente de pago.");
      }
      // US-054 negative case: an obligation whose plan has no current
      // payable version (canonical PUBLISHED, or legacy ACTIVE during the
      // non-destructive transition window)
      // cannot be paid - there is nothing valid left to disclose/accept.
      if (obligation.plan_version_status !== "ACTIVE" && obligation.plan_version_status !== "PUBLISHED") {
        throw new ConflictException("El plan asociado a esta obligación no está activo actualmente.");
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
          // Example (AC): the exact PlanVersion disclosed/accepted right
          // now - captured permanently even if the plan is later edited
          // to a new version.
          planVersionAcceptedId: obligation.plan_version_id,
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

  /** US-063 AC1: "search by document/reference/transaction, status
   * filtering". A single free-text `search` term matches (partial,
   * case-insensitive) against publicReference, the customer's own
   * documentNumber, and either attempt-level reference field - so one
   * box covers all three literal search targets, whichever one the
   * staff member actually has on hand. */
  async search(query: SearchPaymentOrdersQueryDto): Promise<AdminPaymentOrderListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.PaymentOrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { publicReference: { contains: term, mode: "insensitive" } },
        { customer: { documentNumber: { contains: term, mode: "insensitive" } } },
        { attempts: { some: { providerReferenceId: { contains: term, mode: "insensitive" } } } },
        { attempts: { some: { transactions: { some: { boldTransactionId: { contains: term, mode: "insensitive" } } } } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, documentType: true, documentNumber: true } },
          obligation: { select: { concept: true, dueDate: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);

    return { items: orders.map(toAdminPaymentOrderResponse), total, page, pageSize };
  }

  async findByIdForAdmin(id: string): Promise<AdminPaymentOrderResponse> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, documentType: true, documentNumber: true } },
        obligation: { select: { concept: true, dueDate: true } },
      },
    });
    if (!order) {
      throw new NotFoundException("No se encontraron resultados.");
    }
    return toAdminPaymentOrderResponse(order);
  }

  /** US-063 AC1: "viewing the full PaymentEvent history for an order". */
  async listEvents(paymentOrderId: string): Promise<AdminPaymentEventResponse[]> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
    if (!order) {
      throw new NotFoundException("No se encontraron resultados.");
    }
    const events = await this.prisma.paymentEvent.findMany({
      where: { paymentOrderId },
      orderBy: { receivedAt: "desc" },
    });
    return events.map((event) => ({
      id: event.id,
      source: event.source,
      eventType: event.eventType,
      payload: event.payload,
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
    }));
  }

  /**
   * Pre-payment disclosure (AC): the exact ACTIVE plan/service version
   * for a given obligation - the same eligibility rule create() enforces
   * (plan must have a current version with status ACTIVE), since there
   * is nothing valid to disclose otherwise.
   */
  async getDisclosure(obligationId: string): Promise<PrePaymentDisclosureResponse> {
    const obligation = await this.prisma.obligation.findUnique({
      where: { id: obligationId },
      select: {
        concept: true,
        currency: true,
        plan: { select: { currentVersion: true } },
      },
    });
    if (!obligation) {
      throw new NotFoundException("La obligación indicada no existe.");
    }
    if (!obligation.plan.currentVersion || obligation.plan.currentVersion.status !== "ACTIVE") {
      throw new ConflictException("El plan asociado a esta obligación no está activo actualmente.");
    }

    return toPrePaymentDisclosureResponse(obligation.plan.currentVersion, obligation);
  }
}
