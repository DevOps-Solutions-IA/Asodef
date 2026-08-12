import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AffiliateStatus,
  BingoAssignmentStatus,
  BingoEventStatus,
  BingoEventVisibility,
  BingoParticipantStatus,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import type {
  AffiliateBingoCardContract,
  AffiliateBingoEventSummaryContract,
  AffiliateBingoHistoryEntryContract,
  AffiliateBingoRoundStateContract,
  BingoAffiliateActorContract,
  BingoAffiliateReadPortContract,
} from "../contracts/affiliate";

const READABLE_EVENT_STATUSES = [
  BingoEventStatus.PUBLISHED,
  BingoEventStatus.IN_PROGRESS,
  BingoEventStatus.COMPLETED,
  BingoEventStatus.CANCELLED,
] as const;

@Injectable()
export class BingoAffiliateReadService implements BingoAffiliateReadPortContract {
  constructor(private readonly prisma: PrismaService) {}

  async listMyEvents(
    actor: BingoAffiliateActorContract,
  ): Promise<readonly AffiliateBingoEventSummaryContract[]> {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: actor.affiliateId },
      select: { status: true },
    });
    if (!affiliate) throw this.notFound();

    const events = await this.prisma.bingoEvent.findMany({
      where: {
        status: { in: [...READABLE_EVENT_STATUSES] },
        OR: [
          { visibility: BingoEventVisibility.PUBLIC },
          ...(affiliate.status === AffiliateStatus.ACTIVE
            ? [{ visibility: BingoEventVisibility.AUTHENTICATED_AFFILIATES }]
            : []),
          {
            participants: {
              some: {
                affiliateId: actor.affiliateId,
                status: BingoParticipantStatus.APPROVED,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        eligibilityPolicy: true,
        scheduledStartAt: true,
        publishedAt: true,
        createdAt: true,
        participants: {
          where: { affiliateId: actor.affiliateId },
          select: {
            status: true,
            _count: {
              select: {
                assignments: {
                  where: { status: BingoAssignmentStatus.ACTIVE },
                },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: [{ scheduledStartAt: "desc" }, { createdAt: "desc" }],
    });

    return events.map((event) => {
      const participant = event.participants[0];
      const approved = participant?.status === BingoParticipantStatus.APPROVED;
      const eligibleAsAffiliate =
        affiliate.status === AffiliateStatus.ACTIVE &&
        ["AFFILIATES", "AFFILIATES_AND_BENEFICIARIES", "COMBINED"].includes(
          event.eligibilityPolicy,
        );
      return {
        eventId: event.id,
        slug: event.slug,
        name: event.name,
        status: event.status,
        startsAt: (
          event.scheduledStartAt ??
          event.publishedAt ??
          event.createdAt
        ).toISOString(),
        participationStatus: approved
          ? "APPROVED"
          : eligibleAsAffiliate
            ? "ELIGIBLE"
            : "NOT_PARTICIPATING",
        cardCount: participant?._count.assignments ?? 0,
      };
    });
  }

  async listMyCards(
    actor: BingoAffiliateActorContract,
    eventId: string,
  ): Promise<readonly AffiliateBingoCardContract[]> {
    await this.assertEventAccess(actor, eventId, true);
    const drawnBalls = await this.latestDrawnBalls(eventId);
    const assignments = await this.prisma.bingoCardAssignment.findMany({
      where: {
        eventId,
        participant: { affiliateId: actor.affiliateId },
      },
      select: {
        status: true,
        card: { select: { id: true, eventId: true, displayNumber: true, numbers: true } },
      },
      orderBy: [{ assignedAt: "desc" }, { id: "asc" }],
    });
    return assignments.map(({ card, status }) =>
      this.toCardContract(card, status, drawnBalls),
    );
  }

  async getMyCard(
    actor: BingoAffiliateActorContract,
    eventId: string,
    cardId: string,
  ): Promise<AffiliateBingoCardContract> {
    await this.assertEventAccess(actor, eventId, true);
    const assignment = await this.prisma.bingoCardAssignment.findFirst({
      where: {
        eventId,
        cardId,
        participant: { affiliateId: actor.affiliateId },
      },
      select: {
        status: true,
        card: { select: { id: true, eventId: true, displayNumber: true, numbers: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
    if (!assignment) throw this.notFound();
    return this.toCardContract(
      assignment.card,
      assignment.status,
      await this.latestDrawnBalls(eventId),
    );
  }

  async getRoundState(
    actor: BingoAffiliateActorContract,
    eventId: string,
  ): Promise<AffiliateBingoRoundStateContract> {
    await this.assertEventAccess(actor, eventId, false);
    const round = await this.currentRound(eventId);
    if (!round) throw this.notFound();
    const execution = round.executions[0];
    const draws = execution?.draws ?? [];
    const latest = draws.at(-1);
    return {
      eventId,
      roundOrder: round.sequence,
      roundName: round.name,
      status: round.status,
      currentBall: latest?.ballNumber ?? null,
      drawCount: draws.length,
      drawnBalls: draws.map(({ ballNumber }) => ballNumber),
      lastSequence: latest?.sequence ?? 0,
      updatedAt: (latest?.drawnAt ?? execution?.updatedAt ?? round.updatedAt).toISOString(),
    };
  }

  async getHistory(
    actor: BingoAffiliateActorContract,
    eventId: string,
  ): Promise<readonly AffiliateBingoHistoryEntryContract[]> {
    await this.assertEventAccess(actor, eventId, false);
    const executions = await this.prisma.bingoRoundExecution.findMany({
      where: { eventId },
      select: {
        id: true,
        revision: true,
        status: true,
        startedAt: true,
        completedAt: true,
        cancelledAt: true,
        round: { select: { sequence: true } },
        winGroups: {
          select: {
            candidates: {
              where: { participant: { affiliateId: actor.affiliateId } },
              select: { status: true, winner: { select: { status: true } } },
            },
          },
        },
      },
      orderBy: [{ round: { sequence: "asc" } }, { revision: "asc" }],
    });
    return executions.map((execution) => {
      const candidates = execution.winGroups.flatMap(({ candidates }) => candidates);
      const result = candidates.some(({ winner }) => winner?.status === "CONFIRMED")
        ? "WINNER"
        : candidates.some(({ status }) => status === "VALIDATED")
          ? "CANDIDATE"
          : candidates.some(({ status }) => status === "PENDING")
            ? "CANDIDATE"
            : candidates.some(({ status }) => status === "REJECTED")
              ? "REJECTED"
              : "NONE";
      return {
        roundOrder: execution.round.sequence,
        revision: execution.revision,
        status: execution.status,
        startedAt: execution.startedAt?.toISOString() ?? null,
        closedAt: (execution.completedAt ?? execution.cancelledAt)?.toISOString() ?? null,
        result,
      };
    });
  }

  private async assertEventAccess(
    actor: BingoAffiliateActorContract,
    eventId: string,
    participationRequired: boolean,
  ): Promise<void> {
    const [event, affiliate, participant] = await Promise.all([
      this.prisma.bingoEvent.findFirst({
        where: { id: eventId, status: { in: [...READABLE_EVENT_STATUSES] } },
        select: { visibility: true },
      }),
      this.prisma.affiliate.findUnique({
        where: { id: actor.affiliateId },
        select: { status: true },
      }),
      this.prisma.bingoParticipant.findFirst({
        where: {
          eventId,
          affiliateId: actor.affiliateId,
          status: BingoParticipantStatus.APPROVED,
        },
        select: { id: true },
      }),
    ]);
    if (!event || !affiliate) throw this.notFound();
    const allowed =
      event.visibility === BingoEventVisibility.PUBLIC ||
      (event.visibility === BingoEventVisibility.AUTHENTICATED_AFFILIATES &&
        affiliate.status === AffiliateStatus.ACTIVE) ||
      Boolean(participant);
    if (!allowed || (participationRequired && !participant)) throw this.notFound();
  }

  private async latestDrawnBalls(eventId: string): Promise<ReadonlySet<number>> {
    const execution = await this.prisma.bingoRoundExecution.findFirst({
      where: { eventId, status: { in: ["RUNNING", "PAUSED", "COMPLETED"] } },
      select: { draws: { select: { ballNumber: true }, orderBy: { sequence: "asc" } } },
      orderBy: [{ round: { sequence: "desc" } }, { revision: "desc" }],
    });
    return new Set(execution?.draws.map(({ ballNumber }) => ballNumber) ?? []);
  }

  private currentRound(eventId: string) {
    return this.prisma.bingoRound.findFirst({
      where: {
        eventId,
        status: { in: ["IN_PROGRESS", "READY", "COMPLETED", "CANCELLED"] },
      },
      select: {
        sequence: true,
        name: true,
        status: true,
        updatedAt: true,
        executions: {
          select: {
            updatedAt: true,
            draws: {
              select: { sequence: true, ballNumber: true, drawnAt: true },
              orderBy: { sequence: "asc" },
            },
          },
          orderBy: { revision: "desc" },
          take: 1,
        },
      },
      orderBy: [{ sequence: "desc" }],
    });
  }

  private toCardContract(
    card: { id: string; eventId: string; displayNumber: string; numbers: number[] },
    status: BingoAssignmentStatus,
    drawnBalls: ReadonlySet<number>,
  ): AffiliateBingoCardContract {
    const cardNumber = Number(card.displayNumber);
    if (!Number.isSafeInteger(cardNumber) || cardNumber < 0) {
      throw new Error("BINGO_INVALID_CARD_DISPLAY_NUMBER");
    }
    return {
      cardId: card.id,
      eventId: card.eventId,
      cardNumber,
      layout: card.numbers,
      markedPositions: card.numbers.flatMap((number, position) =>
        number === 0 || drawnBalls.has(number) ? [position] : [],
      ),
      assignmentStatus: status,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException("Bingo no encontrado.");
  }
}
