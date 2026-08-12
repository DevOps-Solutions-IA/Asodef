export interface PublicBingoPrizeContract {
  name: string;
  description: string | null;
}

export interface PublicBingoWinnerContract {
  cardNumber: number;
  displayName?: string;
  confirmedAt: string;
}

export interface PublicBingoEventContract {
  slug: string;
  name: string;
  description: string | null;
  status: "PUBLISHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startsAt: string;
  endsAt: string | null;
  rules: readonly string[];
  prizes: readonly PublicBingoPrizeContract[];
  winnerVisibility: "CARD_ONLY" | "PARTIAL_NAME_AND_CARD";
}

export interface PublicBingoSnapshotContract {
  eventSlug: string;
  roundOrder: number;
  roundName: string;
  status: "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  currentBall: number | null;
  drawnBalls: readonly number[];
  lastSequence: number;
  updatedAt: string;
  winners: readonly PublicBingoWinnerContract[];
  fairness?: {
    protocolVersion: string;
    commitment: string;
    revealedSeed?: string;
    revealedAt?: string;
  };
}

export const PUBLIC_BINGO_EVENT_FIELDS = Object.freeze([
  "slug",
  "name",
  "description",
  "status",
  "startsAt",
  "endsAt",
  "rules",
  "prizes",
  "winnerVisibility",
] as const);

export const PUBLIC_BINGO_SNAPSHOT_FIELDS = Object.freeze([
  "eventSlug",
  "roundOrder",
  "roundName",
  "status",
  "currentBall",
  "drawnBalls",
  "lastSequence",
  "updatedAt",
  "winners",
  "fairness",
] as const);

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "id",
  "eventId",
  "roundId",
  "executionId",
  "participantId",
  "affiliateId",
  "candidateId",
  "winnerId",
  "document",
  "documentNumber",
  "phone",
  "email",
  "address",
  "subjectRef",
  "seed",
  "secretSeed",
  "actorUserId",
]);

/** Defensive recursive check to keep accidental Prisma/model spreads out of public DTOs. */
export function assertPublicBingoPayloadSafe(
  value: unknown,
  path = "payload",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertPublicBingoPayloadSafe(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key))
      throw new Error(`BINGO_PUBLIC_FIELD_FORBIDDEN:${path}.${key}`);
    assertPublicBingoPayloadSafe(child, `${path}.${key}`);
  }
}

export const BINGO_PUBLIC_ROUTE_CONTRACTS = Object.freeze([
  { method: "GET", path: "/public/bingo/events/:eventSlug" },
  { method: "GET", path: "/public/bingo/events/:eventSlug/snapshot" },
] as const);
