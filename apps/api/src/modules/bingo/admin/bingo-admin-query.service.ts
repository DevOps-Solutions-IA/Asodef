import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service";
import type { BingoPageQueryDto } from "../contracts/common";

@Injectable()
export class BingoAdminQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(query: BingoPageQueryDto) {
    const { page, pageSize, skip } = pagination(query);
    const search = query.search?.trim();
    const where: Prisma.BingoEventWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};
    const [events, total] = await this.prisma.$transaction([
      this.prisma.bingoEvent.findMany({
        where,
        orderBy: [{ scheduledStartAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        select: eventSelect,
      }),
      this.prisma.bingoEvent.count({ where }),
    ]);
    return pageResult(events.map(mapEvent), page, pageSize, total);
  }

  async getEvent(eventId: string) {
    const event = await this.prisma.bingoEvent.findUnique({
      where: { id: eventId },
      select: {
        ...eventSelect,
        rounds: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            sequence: true,
            name: true,
            status: true,
            tiePolicy: true,
            validationPolicy: true,
          },
        },
      },
    });
    if (event === null) throw bingoNotFound();
    return {
      ...mapEvent(event),
      rounds: event.rounds.map((round) => ({
        id: round.id,
        eventId,
        order: round.sequence,
        name: round.name,
        status: round.status,
        tiePolicy: round.tiePolicy,
        validationPolicy: round.validationPolicy,
      })),
    };
  }

  async getExecution(executionId: string) {
    const execution = await this.prisma.bingoRoundExecution.findUnique({
      where: { id: executionId },
      include: {
        fairness: { select: { commitmentHash: true } },
        _count: { select: { draws: true } },
      },
    });
    if (execution === null) throw bingoNotFound();
    return {
      id: execution.id,
      eventId: execution.eventId,
      roundId: execution.roundId,
      revision: execution.revision,
      status: execution.status,
      fairnessMode: execution.fairnessModeSnapshot,
      configurationHash: execution.configurationHash,
      commitment: execution.fairness?.commitmentHash ?? null,
      startedAt: iso(execution.startedAt),
      closedAt: iso(execution.completedAt ?? execution.cancelledAt),
      drawCount: execution._count.draws,
      stateVersion: execution.stateVersion.toString(),
    };
  }

  async listAudit(eventId: string, query: BingoPageQueryDto) {
    await this.assertEvent(eventId);
    const { page, pageSize, skip } = pagination(query);
    const where = { eventId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bingoAuditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          eventId: true,
          roundId: true,
          executionId: true,
          actorUserId: true,
          action: true,
          result: true,
          requestId: true,
          reason: true,
          createdAt: true,
          metadata: true,
        },
      }),
      this.prisma.bingoAuditEvent.count({ where }),
    ]);
    return pageResult(
      rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        roundId: row.roundId,
        executionId: row.executionId,
        actorUserId: row.actorUserId,
        action: row.action,
        result: row.result,
        requestId: row.requestId,
        reason: row.reason,
        occurredAt: row.createdAt.toISOString(),
        metadata: publicMetadata(row.metadata),
      })),
      page,
      pageSize,
      total,
    );
  }

  private async assertEvent(eventId: string) {
    if (
      (await this.prisma.bingoEvent.findUnique({
        where: { id: eventId },
        select: { id: true },
      })) === null
    ) {
      throw bingoNotFound();
    }
  }
}

const eventSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  status: true,
  visibility: true,
  fairnessMode: true,
  maxCardsPerParticipant: true,
  scheduledStartAt: true,
  completedAt: true,
  configurationLockedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BingoEventSelect;

function mapEvent(event: Prisma.BingoEventGetPayload<{ select: typeof eventSelect }>) {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    description: event.description,
    status: event.status,
    visibility: event.visibility,
    fairnessMode: event.fairnessMode,
    maxCardsPerParticipant: event.maxCardsPerParticipant,
    startsAt: iso(event.scheduledStartAt),
    endsAt: iso(event.completedAt),
    configurationHash: null,
    configurationLockedAt: iso(event.configurationLockedAt),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function pagination(query: BingoPageQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pageResult<T>(data: readonly T[], page: number, pageSize: number, total: number) {
  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function publicMetadata(value: Prisma.JsonValue | null): Record<string, string | number | boolean> {
  if (value === null || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean] =>
      ["string", "number", "boolean"].includes(typeof entry[1]),
    ),
  );
}

function bingoNotFound() {
  return new NotFoundException({
    code: "BINGO_NOT_FOUND",
    message: "El recurso Bingo no existe.",
  });
}
