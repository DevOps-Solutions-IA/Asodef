import { Injectable, type MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import type { BingoRealtimeEnvelopeContract } from "../contracts/realtime";
import { BingoRealtimeRepository } from "./bingo-realtime.repository";
import { BingoRedisFanoutService } from "./bingo-redis-fanout.service";
import {
  BINGO_REALTIME_HEARTBEAT_MS,
  BINGO_REALTIME_REPLAY_LIMIT,
  type BingoRealtimeAccess,
  type BingoRealtimeControlMessage,
} from "./bingo-realtime.types";

const CONNECTION_TTL_MS = 5 * 60_000;

@Injectable()
export class BingoRealtimeStreamService {
  constructor(
    private readonly repository: BingoRealtimeRepository,
    private readonly fanout: BingoRedisFanoutService,
  ) {}

  open(
    access: BingoRealtimeAccess,
    lastEventId: string | null,
    snapshotUrl: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let initialized = false;
      let draining = false;
      let dirty = false;
      let lastSequence = 0;
      let acceptedEventId: string | null = null;

      const emitEnvelope = (envelope: BingoRealtimeEnvelopeContract): void => {
        subscriber.next({
          id: envelope.id,
          type: envelope.type,
          data: envelope,
        });
        lastSequence = envelope.sequence;
        acceptedEventId = envelope.id;
      };

      const control = (
        reason: BingoRealtimeControlMessage["reason"],
        latestSequence: number,
        latestId: string | null,
      ): void => {
        const data: BingoRealtimeControlMessage = {
          kind: reason === "CURSOR_MISSING" ? "SNAPSHOT_REQUIRED" : "RESYNC_REQUIRED",
          reason,
          stream: this.repository.stream(access),
          latestEventId: latestId,
          latestSequence,
          snapshotUrl,
        };
        subscriber.next({
          ...(latestId ? { id: latestId } : {}),
          type: "bingo.resync.v1",
          data,
        });
      };

      const catchUp = async (): Promise<void> => {
        if (closed || draining || !initialized) {
          dirty = true;
          return;
        }
        draining = true;
        try {
          do {
            dirty = false;
            const events = await this.repository.projectedAfter(
              access,
              lastSequence,
              BINGO_REALTIME_REPLAY_LIMIT + 1,
            );
            if (events.length > BINGO_REALTIME_REPLAY_LIMIT) {
              const latest = await this.repository.latestCursor(access);
              control(
                "REPLAY_WINDOW_EXCEEDED",
                latest.lastSequence,
                latest.lastEventId,
              );
              lastSequence = latest.lastSequence;
              acceptedEventId = latest.lastEventId;
              continue;
            }
            for (const event of events) emitEnvelope(event);
          } while (dirty && !closed);
        } catch (error) {
          if (!closed) subscriber.error(error);
        } finally {
          draining = false;
        }
      };

      // Subscribe before resolving/replaying the PostgreSQL cursor. A Redis
      // notification that races initialization only marks the connection
      // dirty; the subsequent catch-up reads every authoritative row.
      const redisSubscription = this.fanout.observe().subscribe({
        next: (notification) => {
          if (notification.eventId !== access.eventId) return;
          dirty = true;
          void catchUp();
        },
        error: (error) => subscriber.error(error),
      });

      void (async () => {
        try {
          if (lastEventId) {
            const cursor = await this.repository.resolveCursor(access, lastEventId);
            if (!cursor) {
              const latest = await this.repository.latestCursor(access);
              control("CURSOR_NOT_FOUND", latest.lastSequence, latest.lastEventId);
              lastSequence = latest.lastSequence;
              acceptedEventId = latest.lastEventId;
            } else {
              lastSequence = cursor.lastSequence;
              acceptedEventId = cursor.lastEventId;
            }
          } else {
            const latest = await this.repository.latestCursor(access);
            control("CURSOR_MISSING", latest.lastSequence, latest.lastEventId);
            lastSequence = latest.lastSequence;
            acceptedEventId = latest.lastEventId;
          }
          initialized = true;
          dirty = true;
          await catchUp();
        } catch (error) {
          if (!closed) subscriber.error(error);
        }
      })();

      const heartbeat = setInterval(() => {
        if (closed) return;
        subscriber.next({
          type: "heartbeat",
          data: {
            generatedAt: new Date().toISOString(),
            lastEventId: acceptedEventId,
            lastSequence,
          },
        });
      }, BINGO_REALTIME_HEARTBEAT_MS);
      heartbeat.unref();

      // Administrative and affiliate authorization is re-evaluated on every
      // reconnect. Bounding a connection prevents an indefinitely privileged
      // stream after session revocation without making Redis an auth source.
      const expiry = setTimeout(() => subscriber.complete(), CONNECTION_TTL_MS);
      expiry.unref();

      return () => {
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(expiry);
        redisSubscription.unsubscribe();
      };
    });
  }
}
