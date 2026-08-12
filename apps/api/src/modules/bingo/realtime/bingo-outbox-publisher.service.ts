import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { BingoOutboxStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { BINGO_OUTBOX_EVENT_TYPES } from "../application/outbox";
import { BingoRedisFanoutService } from "./bingo-redis-fanout.service";
import { BingoFeatureFlagsService } from "../feature-flags";

interface ClaimedOutboxRow {
  id: string;
  event_id: string;
  sequence: bigint;
  event_type: string;
  attempt_count: number;
}

const POLL_INTERVAL_MS = 500;
const MAX_BATCH_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BingoOutboxPublisherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BingoOutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fanout: BingoRedisFanoutService,
    private readonly flags?: BingoFeatureFlagsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.flags && !this.flags.isEnabled("realtime")) return;
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.timer.unref();
    void this.poll();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async publishReadyBatch(
    take = 50,
    now = new Date(),
    eventId?: string,
  ): Promise<number> {
    if (!Number.isInteger(take) || take < 1 || take > MAX_BATCH_SIZE) {
      throw new RangeError("BINGO_OUTBOX_INVALID_BATCH_SIZE");
    }
    if (eventId !== undefined && !UUID.test(eventId)) {
      throw new RangeError("BINGO_OUTBOX_INVALID_EVENT_ID");
    }
    let published = 0;
    for (let index = 0; index < take; index += 1) {
      const processed = await this.publishNext(now, eventId);
      if (!processed) break;
      if (processed === "PUBLISHED") published += 1;
    }
    return published;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.publishReadyBatch();
    } catch (error) {
      this.logger.error(
        "Bingo outbox publisher poll failed",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.polling = false;
    }
  }

  private async publishNext(
    now: Date,
    eventId?: string,
  ): Promise<"PUBLISHED" | "FAILED" | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
          SELECT id, event_id, sequence, event_type, attempt_count
          FROM bingo_outbox_events
          WHERE status IN ('PENDING'::bingo_outbox_status, 'FAILED'::bingo_outbox_status)
            AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
            ${eventId ? Prisma.sql`AND event_id = ${eventId}::uuid` : Prisma.empty}
          ORDER BY created_at ASC, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `);
        const row = rows[0];
        if (!row) return null;
        if (!(BINGO_OUTBOX_EVENT_TYPES as readonly string[]).includes(row.event_type)) {
          await this.markFailed(tx, row, now, "unsupported event type");
          return "FAILED";
        }
        const sequence = Number(row.sequence);
        if (!Number.isSafeInteger(sequence) || sequence < 1) {
          await this.markFailed(tx, row, now, "invalid sequence");
          return "FAILED";
        }
        try {
          await this.fanout.publish({
            schemaVersion: 1,
            outboxEventId: row.id,
            eventId: row.event_id,
            sequence,
          });
          await tx.bingoOutboxEvent.update({
            where: { id: row.id },
            data: {
              status: BingoOutboxStatus.PUBLISHED,
              publishedAt: now,
              attemptCount: { increment: 1 },
              nextAttemptAt: null,
              lastError: null,
            },
          });
          return "PUBLISHED";
        } catch (error) {
          await this.markFailed(
            tx,
            row,
            now,
            "REDIS_PUBLISH_FAILED",
          );
          this.logger.warn(
            `Bingo outbox publish failed for ${row.id}; retry scheduled${error instanceof Error ? ` (${error.name})` : ""}`,
          );
          return "FAILED";
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async markFailed(
    tx: Prisma.TransactionClient,
    row: ClaimedOutboxRow,
    now: Date,
    error: string,
  ): Promise<void> {
    const attempt = row.attempt_count + 1;
    const delaySeconds = Math.min(60, 2 ** Math.min(attempt, 6));
    await tx.bingoOutboxEvent.update({
      where: { id: row.id },
      data: {
        status: BingoOutboxStatus.FAILED,
        attemptCount: attempt,
        nextAttemptAt: new Date(now.getTime() + delaySeconds * 1_000),
        lastError: error.slice(0, 500),
      },
    });
  }
}
