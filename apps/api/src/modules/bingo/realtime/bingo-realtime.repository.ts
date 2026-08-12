import { Injectable, NotFoundException } from "@nestjs/common";
import {
  BingoEventStatus,
  BingoEventVisibility,
  BingoParticipantStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  assertBingoRealtimeEnvelope,
  BINGO_REALTIME_EVENT_CATALOG,
  type BingoRealtimeEnvelopeContract,
  type BingoRealtimeEventType,
  type BingoRealtimeCursorContract,
  type BingoRealtimeSurface,
} from "../contracts/realtime";
import type { BingoRealtimeAccess } from "./bingo-realtime.types";

const READABLE_EVENT_STATUSES = [
  BingoEventStatus.PUBLISHED,
  BingoEventStatus.IN_PROGRESS,
  BingoEventStatus.COMPLETED,
  BingoEventStatus.CANCELLED,
] as const;

@Injectable()
export class BingoRealtimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async publicAccess(eventSlug: string): Promise<BingoRealtimeAccess> {
    const event = await this.prisma.bingoEvent.findFirst({
      where: {
        slug: eventSlug,
        visibility: BingoEventVisibility.PUBLIC,
        status: { in: [...READABLE_EVENT_STATUSES] },
      },
      select: { id: true, slug: true, publicWinnerVisibility: true },
    });
    if (!event) throw new NotFoundException("Bingo no encontrado.");
    return {
      eventId: event.id,
      eventSlug: event.slug,
      surface: "PUBLIC",
      winnerDisplayNameAllowed:
        event.publicWinnerVisibility === "PARTIAL_NAME_AND_CARD",
    };
  }

  async affiliateAccess(
    eventId: string,
    affiliateId: string,
  ): Promise<BingoRealtimeAccess> {
    const event = await this.prisma.bingoEvent.findFirst({
      where: {
        id: eventId,
        status: { in: [...READABLE_EVENT_STATUSES] },
        participants: {
          some: {
            affiliateId,
            status: BingoParticipantStatus.APPROVED,
          },
        },
      },
      select: { id: true, slug: true, publicWinnerVisibility: true },
    });
    if (!event) throw new NotFoundException("Bingo no encontrado.");
    return {
      eventId: event.id,
      eventSlug: event.slug,
      surface: "AFFILIATE",
      winnerDisplayNameAllowed:
        event.publicWinnerVisibility === "PARTIAL_NAME_AND_CARD",
    };
  }

  async adminAccess(eventId: string): Promise<BingoRealtimeAccess> {
    const event = await this.prisma.bingoEvent.findUnique({
      where: { id: eventId },
      select: { id: true, slug: true },
    });
    if (!event) throw new NotFoundException("Bingo no encontrado.");
    return {
      eventId: event.id,
      eventSlug: event.slug,
      surface: "ADMIN",
      winnerDisplayNameAllowed: true,
    };
  }

  stream(access: BingoRealtimeAccess): string {
    return `${access.surface.toLowerCase()}:${access.eventSlug}`;
  }

  async resolveCursor(
    access: BingoRealtimeAccess,
    outboxEventId: string,
  ): Promise<BingoRealtimeCursorContract | null> {
    const row = await this.prisma.bingoOutboxEvent.findFirst({
      where: {
        id: outboxEventId,
        eventId: access.eventId,
        eventType: { in: this.allowedTypes(access.surface) },
      },
      select: { id: true, sequence: true },
    });
    if (!row) return null;
    const projectedSequence = await this.prisma.bingoOutboxEvent.count({
      where: {
        eventId: access.eventId,
        eventType: { in: this.allowedTypes(access.surface) },
        sequence: { lte: row.sequence },
      },
    });
    return {
      stream: this.stream(access),
      lastEventId: row.id,
      lastSequence: projectedSequence,
    };
  }

  async latestCursor(
    access: BingoRealtimeAccess,
  ): Promise<BingoRealtimeCursorContract> {
    const row = await this.prisma.bingoOutboxEvent.findFirst({
      where: {
        eventId: access.eventId,
        eventType: { in: this.allowedTypes(access.surface) },
      },
      orderBy: { sequence: "desc" },
      select: { id: true, sequence: true },
    });
    const count = row
      ? await this.prisma.bingoOutboxEvent.count({
          where: {
            eventId: access.eventId,
            eventType: { in: this.allowedTypes(access.surface) },
          },
        })
      : 0;
    return {
      stream: this.stream(access),
      lastEventId: row?.id ?? null,
      lastSequence: count,
    };
  }

  async projectedAfter(
    access: BingoRealtimeAccess,
    sequence: number,
    take: number,
  ): Promise<readonly BingoRealtimeEnvelopeContract[]> {
    const rows = await this.prisma.bingoOutboxEvent.findMany({
      where: {
        eventId: access.eventId,
        eventType: { in: this.allowedTypes(access.surface) },
      },
      orderBy: { sequence: "asc" },
      skip: sequence,
      take,
      select: {
        id: true,
        eventType: true,
        aggregateId: true,
        publicPayload: true,
        createdAt: true,
        execution: {
          select: {
            id: true,
            revision: true,
            round: { select: { id: true, sequence: true } },
          },
        },
      },
    });
    const projected: BingoRealtimeEnvelopeContract[] = [];
    for (const row of rows) {
      const type = row.eventType as BingoRealtimeEventType;
      const data = await this.projectData(access, type, row);
      const envelope: BingoRealtimeEnvelopeContract = {
        id: row.id,
        type,
        stream: this.stream(access),
        sequence: sequence + projected.length + 1,
        occurredAt: row.createdAt.toISOString(),
        surface: access.surface,
        data,
      };
      assertBingoRealtimeEnvelope(envelope);
      projected.push(envelope);
    }
    return projected;
  }

  private async projectData(
    access: BingoRealtimeAccess,
    type: BingoRealtimeEventType,
    row: {
      aggregateId: string;
      publicPayload: Prisma.JsonValue;
      execution: {
        id: string;
        revision: number;
        round: { id: string; sequence: number };
      } | null;
    },
  ): Promise<Readonly<Record<string, unknown>>> {
    const payload = this.record(row.publicPayload);
    const execution = row.execution;
    if (type.startsWith("bingo.execution.")) {
      if (!execution) throw new Error("BINGO_REALTIME_EXECUTION_MISSING");
      return {
        schemaVersion: 1,
        eventSlug: access.eventSlug,
        roundOrder: execution.round.sequence,
        revision: execution.revision,
        status: payload.status,
        occurredAt: payload.occurredAt,
        ...(access.surface === "ADMIN"
          ? {
              eventId: access.eventId,
              roundId: execution.round.id,
              executionId: execution.id,
            }
          : {}),
      };
    }
    if (type === "bingo.draw.created.v1") {
      if (!execution) throw new Error("BINGO_REALTIME_EXECUTION_MISSING");
      return {
        schemaVersion: 1,
        eventSlug: access.eventSlug,
        roundOrder: execution.round.sequence,
        revision: execution.revision,
        drawSequence: payload.sequence,
        ball: payload.ballNumber,
        drawnAt: payload.drawnAt,
        ...(access.surface === "ADMIN"
          ? {
              eventId: access.eventId,
              roundId: execution.round.id,
              executionId: execution.id,
              drawId: payload.drawId,
              stateVersion: payload.stateVersion,
            }
          : {}),
      };
    }
    if (type.startsWith("bingo.candidate.")) {
      return {
        schemaVersion: 1,
        candidateId: payload.candidateId,
        executionId: payload.executionId,
        patternId: payload.patternId,
        decisiveDrawSequence: payload.decisiveDrawSequence,
        decisiveBall: payload.decisiveBall,
        status: payload.status,
        occurredAt: payload.occurredAt,
      };
    }
    if (!execution) throw new Error("BINGO_REALTIME_EXECUTION_MISSING");
    const winner = await this.prisma.bingoWinner.findUnique({
      where: { id: row.aggregateId },
      select: {
        id: true,
        publicDisplaySnapshot: true,
        validatedAt: true,
        createdAt: true,
      },
    });
    if (!winner) throw new Error("BINGO_REALTIME_WINNER_MISSING");
    const snapshot = this.record(winner.publicDisplaySnapshot);
    const cardNumber = Number(snapshot.cardNumber);
    if (!Number.isSafeInteger(cardNumber) || cardNumber < 0) {
      throw new Error("BINGO_REALTIME_WINNER_SNAPSHOT_INVALID");
    }
    return {
      schemaVersion: 1,
      eventSlug: access.eventSlug,
      roundOrder: execution.round.sequence,
      cardNumber,
      ...(access.winnerDisplayNameAllowed &&
      typeof snapshot.displayName === "string" &&
      snapshot.displayName.length <= 120
        ? { displayName: snapshot.displayName }
        : {}),
      confirmedAt: (winner.validatedAt ?? winner.createdAt).toISOString(),
      ...(access.surface === "ADMIN"
        ? { winnerId: winner.id, executionId: execution.id }
        : {}),
    };
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("BINGO_REALTIME_PAYLOAD_INVALID");
    }
    return value as Record<string, unknown>;
  }

  private allowedTypes(surface: BingoRealtimeSurface): string[] {
    return Object.entries(BINGO_REALTIME_EVENT_CATALOG)
      .filter(([, surfaces]) => (surfaces as readonly string[]).includes(surface))
      .map(([type]) => type);
  }
}
