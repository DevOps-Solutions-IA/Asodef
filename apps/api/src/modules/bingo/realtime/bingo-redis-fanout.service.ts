import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type Redis from "ioredis";
import { Observable, Subject } from "rxjs";
import { RedisService } from "../../../common/redis/redis.service";
import {
  BINGO_REDIS_OUTBOX_CHANNEL,
  type BingoOutboxNotification,
} from "./bingo-realtime.types";
import { BingoFeatureFlagsService } from "../feature-flags";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BingoRedisFanoutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BingoRedisFanoutService.name);
  private readonly notifications = new Subject<BingoOutboxNotification>();
  private subscriber: Redis | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly flags?: BingoFeatureFlagsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.flags && !this.flags.isEnabled("realtime")) return;
    const subscriber = this.redis.getClient().duplicate({ lazyConnect: true });
    this.subscriber = subscriber;
    subscriber.on("error", (error) => {
      this.logger.error(
        "Bingo realtime Redis subscriber error",
        error instanceof Error ? error.stack : undefined,
      );
    });
    subscriber.on("message", (channel, raw) => {
      if (channel !== BINGO_REDIS_OUTBOX_CHANNEL) return;
      try {
        this.notifications.next(this.parse(raw));
      } catch (error) {
        this.logger.warn(
          `Discarded invalid Bingo realtime notification: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    });
    await subscriber.connect();
    await subscriber.subscribe(BINGO_REDIS_OUTBOX_CHANNEL);
  }

  async onModuleDestroy(): Promise<void> {
    this.notifications.complete();
    const subscriber = this.subscriber;
    this.subscriber = null;
    if (!subscriber) return;
    await subscriber.unsubscribe(BINGO_REDIS_OUTBOX_CHANNEL).catch(() => undefined);
    await subscriber.quit().catch(() => subscriber.disconnect());
  }

  observe(): Observable<BingoOutboxNotification> {
    return this.notifications.asObservable();
  }

  async publish(notification: BingoOutboxNotification): Promise<void> {
    this.assert(notification);
    await this.redis
      .getClient()
      .publish(BINGO_REDIS_OUTBOX_CHANNEL, JSON.stringify(notification));
  }

  private parse(raw: string): BingoOutboxNotification {
    if (raw.length > 512) throw new Error("notification too large");
    const parsed: unknown = JSON.parse(raw);
    this.assert(parsed);
    return parsed;
  }

  private assert(value: unknown): asserts value is BingoOutboxNotification {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid notification");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length !== 4 ||
      keys.some(
        (key) =>
          !["schemaVersion", "outboxEventId", "eventId", "sequence"].includes(key),
      ) ||
      record.schemaVersion !== 1 ||
      typeof record.outboxEventId !== "string" ||
      !UUID.test(record.outboxEventId) ||
      typeof record.eventId !== "string" ||
      !UUID.test(record.eventId) ||
      !Number.isSafeInteger(record.sequence) ||
      Number(record.sequence) < 1
    ) {
      throw new Error("invalid notification");
    }
  }
}
