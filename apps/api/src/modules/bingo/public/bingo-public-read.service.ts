import { Injectable, NotFoundException } from "@nestjs/common";
import {
  BingoEventStatus,
  BingoEventVisibility,
  BingoWinnerStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  assertPublicBingoPayloadSafe,
  type PublicBingoEventContract,
  type PublicBingoSnapshotContract,
  type PublicBingoWinnerContract,
} from "../contracts/public";

const PUBLIC_STATUSES = [
  BingoEventStatus.PUBLISHED,
  BingoEventStatus.IN_PROGRESS,
  BingoEventStatus.COMPLETED,
  BingoEventStatus.CANCELLED,
] as const;

@Injectable()
export class BingoPublicReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvent(eventSlug: string): Promise<PublicBingoEventContract> {
    const event = await this.prisma.bingoEvent.findFirst({
      where: {
        slug: eventSlug,
        visibility: BingoEventVisibility.PUBLIC,
        status: { in: [...PUBLIC_STATUSES] },
      },
      select: {
        slug: true,
        name: true,
        description: true,
        status: true,
        scheduledStartAt: true,
        publishedAt: true,
        createdAt: true,
        completedAt: true,
        cancelledAt: true,
        publicWinnerVisibility: true,
        rounds: {
          select: {
            sequence: true,
            prizes: {
              select: { name: true, description: true },
              orderBy: { sequence: "asc" },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
    });
    if (!event) throw this.notFound();
    const response: PublicBingoEventContract = {
      slug: event.slug,
      name: event.name,
      description: event.description,
      status: event.status as PublicBingoEventContract["status"],
      startsAt: (
        event.scheduledStartAt ??
        event.publishedAt ??
        event.createdAt
      ).toISOString(),
      endsAt: (event.completedAt ?? event.cancelledAt)?.toISOString() ?? null,
      // Rules require an explicit future allowlist. Arbitrary event metadata is
      // intentionally never copied into a public response.
      rules: [],
      prizes: event.rounds.flatMap(({ prizes }) => prizes),
      winnerVisibility: event.publicWinnerVisibility,
    };
    assertPublicBingoPayloadSafe(response);
    return response;
  }

  async getSnapshot(eventSlug: string): Promise<PublicBingoSnapshotContract> {
    const event = await this.prisma.bingoEvent.findFirst({
      where: {
        slug: eventSlug,
        visibility: BingoEventVisibility.PUBLIC,
        status: { in: [...PUBLIC_STATUSES] },
      },
      select: {
        id: true,
        slug: true,
        publicWinnerVisibility: true,
        rounds: {
          where: { status: { in: ["READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"] } },
          select: {
            sequence: true,
            name: true,
            status: true,
            updatedAt: true,
            executions: {
              select: {
                id: true,
                updatedAt: true,
                draws: {
                  select: { sequence: true, ballNumber: true, drawnAt: true },
                  orderBy: { sequence: "asc" },
                },
                fairness: {
                  select: {
                    protocolVersion: true,
                    commitmentHash: true,
                    publishedAt: true,
                    revealedSeed: true,
                    revealedAt: true,
                  },
                },
                winGroups: {
                  select: {
                    winners: {
                      where: { status: BingoWinnerStatus.CONFIRMED },
                      select: {
                        validatedAt: true,
                        createdAt: true,
                        publicDisplaySnapshot: true,
                      },
                    },
                  },
                },
              },
              orderBy: { revision: "desc" },
              take: 1,
            },
          },
          orderBy: { sequence: "desc" },
          take: 1,
        },
      },
    });
    const round = event?.rounds[0];
    if (!event || !round) throw this.notFound();
    const execution = round.executions[0];
    const draws = execution?.draws ?? [];
    const latest = draws.at(-1);
    const fairness = execution?.fairness;
    const response: PublicBingoSnapshotContract = {
      eventSlug: event.slug,
      roundOrder: round.sequence,
      roundName: round.name,
      status: round.status as PublicBingoSnapshotContract["status"],
      currentBall: latest?.ballNumber ?? null,
      drawnBalls: draws.map(({ ballNumber }) => ballNumber),
      lastSequence: latest?.sequence ?? 0,
      updatedAt: (latest?.drawnAt ?? execution?.updatedAt ?? round.updatedAt).toISOString(),
      winners: (execution?.winGroups ?? []).flatMap(({ winners }) =>
        winners.map((winner) =>
          this.toPublicWinner(
            winner.publicDisplaySnapshot,
            winner.validatedAt ?? winner.createdAt,
            event.publicWinnerVisibility,
          ),
        ),
      ),
      ...(fairness?.publishedAt
        ? {
            fairness: {
              protocolVersion: fairness.protocolVersion,
              commitment: fairness.commitmentHash,
              // The seed crosses this boundary only after the authoritative
              // reveal timestamp is committed. A merely stored/custodied seed
              // is never public.
              ...(fairness.revealedAt && fairness.revealedSeed
                ? {
                    revealedSeed: fairness.revealedSeed,
                    revealedAt: fairness.revealedAt.toISOString(),
                  }
                : {}),
            },
          }
        : {}),
    };
    assertPublicBingoPayloadSafe(response);
    return response;
  }

  private toPublicWinner(
    snapshot: Prisma.JsonValue,
    confirmedAt: Date,
    visibility: "CARD_ONLY" | "PARTIAL_NAME_AND_CARD",
  ): PublicBingoWinnerContract {
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") {
      throw new Error("BINGO_INVALID_PUBLIC_WINNER_SNAPSHOT");
    }
    const cardNumber = Number(snapshot.cardNumber);
    if (!Number.isSafeInteger(cardNumber) || cardNumber < 0) {
      throw new Error("BINGO_INVALID_PUBLIC_WINNER_CARD_NUMBER");
    }
    const displayName =
      visibility === "PARTIAL_NAME_AND_CARD" &&
      typeof snapshot.displayName === "string" &&
      snapshot.displayName.length <= 120
        ? snapshot.displayName
        : undefined;
    return {
      cardNumber,
      ...(displayName ? { displayName } : {}),
      confirmedAt: confirmedAt.toISOString(),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException("Bingo no encontrado.");
  }
}
