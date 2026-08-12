import type { BingoEventStatusContract } from "../common";

/**
 * Application boundary created only after SelfServiceSession.subjectRef has
 * resolved through AffiliateExternalIdentity. It is never populated from a
 * route parameter, document, phone or affiliate code.
 */
export interface BingoAffiliateActorContract {
  sessionId: string;
  affiliateId: string;
  identityId: string;
  identityIssuer: string;
  assurance: "OTP";
  scope: "affiliate:bingo:read";
}

export interface AffiliateBingoEventSummaryContract {
  eventId: string;
  slug: string;
  name: string;
  status: BingoEventStatusContract;
  startsAt: string;
  participationStatus: "ELIGIBLE" | "APPROVED" | "NOT_PARTICIPATING";
  cardCount: number;
}

export interface AffiliateBingoCardContract {
  cardId: string;
  eventId: string;
  cardNumber: number;
  layout: readonly number[];
  markedPositions: readonly number[];
  assignmentStatus: "ACTIVE" | "SUPERSEDED" | "REVOKED";
}

export interface AffiliateBingoRoundStateContract {
  eventId: string;
  roundOrder: number;
  roundName: string;
  status: "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  currentBall: number | null;
  drawCount: number;
  drawnBalls: readonly number[];
  lastSequence: number;
  updatedAt: string;
}

export interface AffiliateBingoHistoryEntryContract {
  roundOrder: number;
  revision: number;
  status: "PLANNED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
  startedAt: string | null;
  closedAt: string | null;
  result: "NONE" | "CANDIDATE" | "WINNER" | "REJECTED";
}

export interface BingoAffiliateReadPortContract {
  listMyEvents(actor: BingoAffiliateActorContract): Promise<readonly AffiliateBingoEventSummaryContract[]>;
  listMyCards(actor: BingoAffiliateActorContract, eventId: string): Promise<readonly AffiliateBingoCardContract[]>;
  getMyCard(actor: BingoAffiliateActorContract, eventId: string, cardId: string): Promise<AffiliateBingoCardContract>;
  getRoundState(actor: BingoAffiliateActorContract, eventId: string): Promise<AffiliateBingoRoundStateContract>;
  getHistory(actor: BingoAffiliateActorContract, eventId: string): Promise<readonly AffiliateBingoHistoryEntryContract[]>;
}

export const BINGO_AFFILIATE_ROUTE_CONTRACTS = Object.freeze([
  { method: "GET", path: "/self-service/affiliate/bingo/events", scope: "affiliate:bingo:read" },
  { method: "GET", path: "/self-service/affiliate/bingo/events/:eventId/cards", scope: "affiliate:bingo:read" },
  { method: "GET", path: "/self-service/affiliate/bingo/events/:eventId/cards/:cardId", scope: "affiliate:bingo:read" },
  { method: "GET", path: "/self-service/affiliate/bingo/events/:eventId/state", scope: "affiliate:bingo:read" },
  { method: "GET", path: "/self-service/affiliate/bingo/events/:eventId/history", scope: "affiliate:bingo:read" },
] as const);

