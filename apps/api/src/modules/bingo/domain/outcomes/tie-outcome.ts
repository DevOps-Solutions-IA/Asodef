import type { ValidatedCandidate } from "./validation";
import { evidenceFingerprint } from "./fingerprint";

export type TiePolicy =
  | "SPLIT_PRIZE"
  | "FULL_PRIZE_EACH"
  | "TIE_BREAK"
  | "PRECONFIGURED_SPECIAL_RULE";

export type ExactPrizeValue =
  | Readonly<{ kind: "MONEY"; minorUnits: bigint; currency: string }>
  | Readonly<{ kind: "UNITS"; units: bigint; unitCode: string }>;

export interface FrozenTieConfiguration {
  readonly policy: TiePolicy;
  readonly configurationFrozen: boolean;
  readonly specialRuleId?: string;
}

export interface WinnerOutcome {
  readonly id: string;
  readonly candidate: ValidatedCandidate;
  readonly allocation: ExactPrizeAllocation;
}

export type ExactPrizeAllocation =
  | Readonly<{
      kind: "MONEY";
      currency: string;
      payableMinorUnits: bigint;
      exactShareNumerator: bigint;
      exactShareDenominator: bigint;
    }>
  | Readonly<{
      kind: "UNITS";
      unitCode: string;
      payableUnits: bigint;
      exactShareNumerator: bigint;
      exactShareDenominator: bigint;
    }>;

export type TieOutcomeCode =
  | "WINNERS_RESOLVED"
  | "TIE_BREAK_REQUIRED"
  | "SPECIAL_RULE_REQUIRED"
  | "TIE_CONFIGURATION_NOT_FROZEN"
  | "SPECIAL_RULE_ID_REQUIRED"
  | "NO_VALIDATED_CANDIDATES"
  | "DUPLICATE_CANDIDATE"
  | "MIXED_EXECUTIONS"
  | "NON_SIMULTANEOUS_CANDIDATES"
  | "INVALID_PRIZE";

export type TieOutcomeDecision =
  | Readonly<{
      resolved: true;
      code: "WINNERS_RESOLVED";
      policy: "SPLIT_PRIZE" | "FULL_PRIZE_EACH";
      winners: readonly WinnerOutcome[];
      /** Explicitly retained; allocating it requires a separately approved rule. */
      remainder: ExactPrizeValue;
      remainderDisposition: "NONE" | "REQUIRES_PRECONFIGURED_RULE";
    }>
  | Readonly<{
      resolved: false;
      code: "TIE_BREAK_REQUIRED" | "SPECIAL_RULE_REQUIRED";
      policy: "TIE_BREAK" | "PRECONFIGURED_SPECIAL_RULE";
      candidateIds: readonly string[];
      executionId: string;
      prizeId: string;
      specialRuleId?: string;
    }>
  | Readonly<{
      resolved: false;
      code: Exclude<
        TieOutcomeCode,
        "WINNERS_RESOLVED" | "TIE_BREAK_REQUIRED" | "SPECIAL_RULE_REQUIRED"
      >;
    }>;

function prizeAmount(value: ExactPrizeValue): bigint {
  return value.kind === "MONEY" ? value.minorUnits : value.units;
}

function allocation(
  value: ExactPrizeValue,
  payable: bigint,
  numerator: bigint,
  denominator: bigint,
): ExactPrizeAllocation {
  return value.kind === "MONEY"
    ? Object.freeze({
        currency: value.currency,
        exactShareDenominator: denominator,
        exactShareNumerator: numerator,
        kind: "MONEY",
        payableMinorUnits: payable,
      })
    : Object.freeze({
        exactShareDenominator: denominator,
        exactShareNumerator: numerator,
        kind: "UNITS",
        payableUnits: payable,
        unitCode: value.unitCode,
      });
}

function prizeWithAmount(
  value: ExactPrizeValue,
  amount: bigint,
): ExactPrizeValue {
  return value.kind === "MONEY"
    ? Object.freeze({
        currency: value.currency,
        kind: "MONEY",
        minorUnits: amount,
      })
    : Object.freeze({ kind: "UNITS", unitCode: value.unitCode, units: amount });
}

export function resolveTieOutcome(
  input: Readonly<{
    prizeId: string;
    prize: ExactPrizeValue;
    candidates: readonly ValidatedCandidate[];
    tie: FrozenTieConfiguration;
  }>,
): TieOutcomeDecision {
  if (!input.tie.configurationFrozen) {
    return { resolved: false, code: "TIE_CONFIGURATION_NOT_FROZEN" };
  }
  if (
    input.prizeId.trim() === "" ||
    prizeAmount(input.prize) <= 0n ||
    (input.prize.kind === "MONEY" && input.prize.currency.trim() === "") ||
    (input.prize.kind === "UNITS" && input.prize.unitCode.trim() === "")
  ) {
    return { resolved: false, code: "INVALID_PRIZE" };
  }
  const validated = input.candidates.filter(
    (candidate) => candidate.status === "VALIDATED",
  );
  if (validated.length === 0) {
    return { resolved: false, code: "NO_VALIDATED_CANDIDATES" };
  }
  const fingerprints = new Set(
    validated.map((item) => item.candidate.fingerprint),
  );
  if (fingerprints.size !== validated.length) {
    return { resolved: false, code: "DUPLICATE_CANDIDATE" };
  }
  const executionIds = new Set(
    validated.map((item) => item.candidate.match.executionId),
  );
  if (executionIds.size !== 1) {
    return { resolved: false, code: "MIXED_EXECUTIONS" };
  }
  const simultaneousKeys = new Set(
    validated.map((item) => {
      const match = item.candidate.match;
      return [
        match.patternId,
        match.patternKind,
        match.decisiveDraw.id,
        match.decisiveDraw.sequence,
        match.decisiveDraw.ball,
      ].join(":");
    }),
  );
  if (simultaneousKeys.size !== 1) {
    return { resolved: false, code: "NON_SIMULTANEOUS_CANDIDATES" };
  }
  const ordered = [...validated].sort((left, right) =>
    left.candidate.fingerprint.localeCompare(right.candidate.fingerprint),
  );
  const candidateIds = Object.freeze(ordered.map((item) => item.candidate.id));
  const executionId = ordered[0]!.candidate.match.executionId;

  if (input.tie.policy === "TIE_BREAK") {
    return Object.freeze({
      candidateIds,
      code: "TIE_BREAK_REQUIRED",
      executionId,
      policy: "TIE_BREAK",
      prizeId: input.prizeId,
      resolved: false,
    });
  }
  if (input.tie.policy === "PRECONFIGURED_SPECIAL_RULE") {
    if (input.tie.specialRuleId?.trim() === "") {
      return { resolved: false, code: "SPECIAL_RULE_ID_REQUIRED" };
    }
    if (input.tie.specialRuleId === undefined) {
      return { resolved: false, code: "SPECIAL_RULE_ID_REQUIRED" };
    }
    return Object.freeze({
      candidateIds,
      code: "SPECIAL_RULE_REQUIRED",
      executionId,
      policy: "PRECONFIGURED_SPECIAL_RULE",
      prizeId: input.prizeId,
      resolved: false,
      specialRuleId: input.tie.specialRuleId,
    });
  }

  const amount = prizeAmount(input.prize);
  const divisor = BigInt(ordered.length);
  const base = input.tie.policy === "SPLIT_PRIZE" ? amount / divisor : amount;
  const remainder = input.tie.policy === "SPLIT_PRIZE" ? amount % divisor : 0n;
  const winners = Object.freeze(
    ordered.map((candidate) => {
      const exactAllocation = allocation(
        input.prize,
        base,
        amount,
        input.tie.policy === "SPLIT_PRIZE" ? divisor : 1n,
      );
      const fingerprint = evidenceFingerprint({
        allocation:
          exactAllocation.kind === "MONEY"
            ? {
                denominator: exactAllocation.exactShareDenominator,
                numerator: exactAllocation.exactShareNumerator,
                payable: exactAllocation.payableMinorUnits,
                currency: exactAllocation.currency,
                kind: exactAllocation.kind,
              }
            : {
                denominator: exactAllocation.exactShareDenominator,
                numerator: exactAllocation.exactShareNumerator,
                payable: exactAllocation.payableUnits,
                kind: exactAllocation.kind,
                unitCode: exactAllocation.unitCode,
              },
        candidateFingerprint: candidate.candidate.fingerprint,
        policy: input.tie.policy,
        prizeId: input.prizeId,
      });
      return Object.freeze({
        allocation: exactAllocation,
        candidate,
        id: `winner:${fingerprint}`,
      });
    }),
  );
  return Object.freeze({
    code: "WINNERS_RESOLVED",
    policy: input.tie.policy,
    remainder: prizeWithAmount(input.prize, remainder),
    remainderDisposition:
      remainder === 0n ? "NONE" : "REQUIRES_PRECONFIGURED_RULE",
    resolved: true,
    winners,
  });
}
