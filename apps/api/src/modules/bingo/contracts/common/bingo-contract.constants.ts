export const BINGO_CONTRACT_VERSION = "1" as const;

export const BINGO_EVENT_STATUSES = [
  "DRAFT",
  "CONFIGURED",
  "PUBLISHED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
] as const;

export const BINGO_EVENT_VISIBILITIES = [
  "PUBLIC",
  "AUTHENTICATED_AFFILIATES",
  "AUTHORIZED_PARTICIPANTS",
] as const;

export const BINGO_ELIGIBILITY_POLICIES = [
  "AFFILIATES",
  "AFFILIATES_AND_BENEFICIARIES",
  "PARTNER_COMPANY",
  "AUTHORIZED_GUESTS",
  "COMBINED",
  "CUSTOM_APPROVED",
] as const;

export const BINGO_VALIDATION_POLICIES = ["SIMPLE", "DUAL_CONTROL"] as const;
export const BINGO_TIE_POLICIES = [
  "SPLIT_PRIZE",
  "FULL_PRIZE_EACH",
  "TIE_BREAK",
  "PRECONFIGURED_SPECIAL_RULE",
] as const;
export const BINGO_FAIRNESS_MODES = ["CRYPTO_RNG", "CRYPTO_RNG_COMMIT_REVEAL"] as const;
export const BINGO_WINNER_VISIBILITIES = ["CARD_ONLY", "PARTIAL_NAME_AND_CARD"] as const;
export const BINGO_PATTERN_KINDS = ["LINE", "TWO_LINES", "FOUR_CORNERS", "FULL_CARD", "CUSTOM"] as const;
export const BINGO_PARTICIPANT_KINDS = ["AFFILIATE", "BENEFICIARY", "PARTNER_COMPANY_MEMBER", "AUTHORIZED_GUEST"] as const;
export const BINGO_PRIZE_KINDS = ["MONETARY", "IN_KIND"] as const;

export type BingoEventStatusContract = (typeof BINGO_EVENT_STATUSES)[number];
export type BingoEventVisibilityContract = (typeof BINGO_EVENT_VISIBILITIES)[number];
export type BingoEligibilityPolicyContract = (typeof BINGO_ELIGIBILITY_POLICIES)[number];
export type BingoValidationPolicyContract = (typeof BINGO_VALIDATION_POLICIES)[number];
export type BingoTiePolicyContract = (typeof BINGO_TIE_POLICIES)[number];
export type BingoFairnessModeContract = (typeof BINGO_FAIRNESS_MODES)[number];
export type BingoWinnerVisibilityContract = (typeof BINGO_WINNER_VISIBILITIES)[number];
export type BingoPatternKindContract = (typeof BINGO_PATTERN_KINDS)[number];
export type BingoParticipantKindContract = (typeof BINGO_PARTICIPANT_KINDS)[number];
export type BingoPrizeKindContract = (typeof BINGO_PRIZE_KINDS)[number];

export const BINGO_ADMIN_PERMISSION_MAP = Object.freeze({
  eventsRead: "bingo.read",
  eventsCreate: "bingo.create",
  eventsManage: "bingo.manage",
  participantsImport: "bingo.import",
  reportsExport: "bingo.export",
  executionOperate: "bingo.operate",
  candidateValidate: "bingo.validate",
  auditRead: "bingo.audit.read",
} as const);

export const BINGO_AFFILIATE_SCOPE = "affiliate:bingo:read" as const;

