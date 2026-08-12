import type {
  BingoEventStatusContract,
  BingoEventVisibilityContract,
  BingoFairnessModeContract,
  BingoParticipantKindContract,
  BingoPatternKindContract,
  BingoTiePolicyContract,
  BingoValidationPolicyContract,
} from "../common";

export interface AdminBingoEventContract {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: BingoEventStatusContract;
  visibility: BingoEventVisibilityContract;
  fairnessMode: BingoFairnessModeContract;
  maxCardsPerParticipant: number;
  startsAt: string;
  endsAt: string | null;
  configurationHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBingoRoundContract {
  id: string;
  eventId: string;
  order: number;
  name: string;
  status: "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  tiePolicy: BingoTiePolicyContract;
  validationPolicy: BingoValidationPolicyContract;
}

export interface AdminBingoPatternContract {
  id: string;
  name: string;
  kind: BingoPatternKindContract;
  masks: readonly (readonly number[])[];
  frozenAt: string | null;
}

export interface AdminBingoPrizeContract {
  id: string;
  roundId: string;
  name: string;
  kind: "MONETARY" | "IN_KIND";
  monetaryAmount: string | null;
  currency: string | null;
}

export interface AdminBingoParticipantContract {
  id: string;
  eventId: string;
  kind: BingoParticipantKindContract;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  displayLabel: string;
  activeCardCount: number;
  createdAt: string;
}

export interface AdminBingoCardContract {
  id: string;
  eventId: string;
  cardNumber: string;
  layout: readonly number[];
  layoutFingerprint: string;
  activeParticipantId: string | null;
}

export interface AdminBingoExecutionContract {
  id: string;
  roundId: string;
  revision: number;
  status: "PLANNED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
  fairnessMode: BingoFairnessModeContract;
  configurationHash: string;
  commitment: string | null;
  startedAt: string | null;
  closedAt: string | null;
  drawCount: number;
}

export interface AdminBingoDrawContract {
  id: string;
  executionId: string;
  sequence: number;
  ball: number;
  drawnAt: string;
}

export interface AdminBingoCandidateContract {
  id: string;
  executionId: string;
  cardId: string;
  patternId: string;
  decisiveDrawId: string;
  status: "PENDING" | "VALIDATED" | "REJECTED";
  detectedAt: string;
}

export interface AdminBingoWinnerContract {
  id: string;
  candidateId: string;
  prizeId: string;
  status: "PENDING_VALIDATION" | "CONFIRMED" | "REJECTED";
  numerator: string | null;
  denominator: string | null;
  confirmedAt: string | null;
}

export interface AdminBingoAuditContract {
  id: string;
  eventId: string;
  roundId: string | null;
  executionId: string | null;
  actorUserId: string | null;
  action: string;
  result: "SUCCEEDED" | "REJECTED" | "FAILED";
  requestId: string;
  reason: string | null;
  occurredAt: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface AdminBingoReportStatusContract {
  reportId: string;
  eventId: string;
  type: "DRAW_ACT" | "PARTICIPANTS" | "CARDS" | "AUDIT" | "WINNERS";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}
