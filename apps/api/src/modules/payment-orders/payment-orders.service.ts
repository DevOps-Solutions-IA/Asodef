import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PaymentOrder } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { generatePublicReference } from "./public-reference";

/** Obligation statuses that still represent money owed - anything else
 * (PAID, CANCELLED) is not payable. Matches the AC's own "outstanding"
 * wording; the literal negative case only tests PAID, CANCELLED is the
 * same non-inventive extension of "not outstanding". */
const OUTSTANDING_OBLIGATION_STATUSES = ["PENDING", "OVERDUE"] as const;

interface ObligationRow {
  id: string;
  customer_id: string;
  status: string;
  amount_cents: number;
  currency: string;
}

@Injectable()
export class PaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
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
  async create(obligationId: string): Promise<PaymentOrder> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ObligationRow[]>`
        SELECT id, customer_id, status, amount_cents, currency
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
        return existingOrder;
      }

      const ttlMinutes = this.configService.get("PAYMENT_ORDER_TTL_MINUTES", { infer: true });
      return tx.paymentOrder.create({
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
    });
  }
}
