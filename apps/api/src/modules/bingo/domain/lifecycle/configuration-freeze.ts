import { BingoEventStatus, BingoRoundStatus } from "./state-machines";
import {
  BingoLifecycleDecision,
  BingoLifecycleErrorCode,
} from "./lifecycle-errors";

export type ConfigurationPrimitive =
  string | number | boolean | bigint | null | undefined | Date;
export type ConfigurationValue =
  | ConfigurationPrimitive
  | readonly ConfigurationValue[]
  | { readonly [key: string]: ConfigurationValue };

export type CriticalConfiguration = Readonly<
  Record<string, ConfigurationValue>
>;

export const BINGO_EVENT_CRITICAL_CONFIGURATION_FIELDS = [
  "visibility",
  "eligibilityPolicy",
  "maxCardsPerParticipant",
  "publicWinnerVisibility",
  "defaultValidationPolicy",
  "fairnessMode",
  "eligibilityRules",
  "retentionPolicy",
] as const;

export const BINGO_ROUND_CRITICAL_CONFIGURATION_FIELDS = [
  "patterns",
  "tiePolicy",
  "tiePolicyConfiguration",
  "validationPolicy",
  "prizes",
  "specialRuleReference",
] as const;

export const BINGO_PATTERN_CRITICAL_CONFIGURATION_FIELDS = [
  "kind",
  "requiredMatchCount",
  "masks",
] as const;

export interface ConfigurationFreezeContext<
  TBefore extends CriticalConfiguration,
  TAfter extends CriticalConfiguration,
> {
  readonly before: TBefore;
  readonly after: TAfter;
  readonly lockedFields: readonly (keyof TBefore & keyof TAfter & string)[];
}

function structurallyEqual(
  left: ConfigurationValue,
  right: ConfigurationValue,
): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]))
    );
  }

  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    const leftRecord = left as Readonly<Record<string, ConfigurationValue>>;
    const rightRecord = right as Readonly<Record<string, ConfigurationValue>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();

    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          structurallyEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }

  return false;
}

export function changedLockedFields<
  TBefore extends CriticalConfiguration,
  TAfter extends CriticalConfiguration,
>(context: ConfigurationFreezeContext<TBefore, TAfter>): readonly string[] {
  return [...new Set(context.lockedFields)]
    .filter(
      (field) =>
        !structurallyEqual(context.before[field], context.after[field]),
    )
    .sort();
}

export function isEventConfigurationFrozen(
  status: BingoEventStatus,
  configurationLockedAt: Date | null,
): boolean {
  return (
    configurationLockedAt !== null ||
    status === "PUBLISHED" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "ARCHIVED"
  );
}

export function isRoundConfigurationFrozen(
  status: BingoRoundStatus,
  configurationLockedAt: Date | null,
): boolean {
  return configurationLockedAt !== null || status !== "DRAFT";
}

function evaluateFrozenChange<
  TBefore extends CriticalConfiguration,
  TAfter extends CriticalConfiguration,
>(
  frozen: boolean,
  code: BingoLifecycleErrorCode,
  context: ConfigurationFreezeContext<TBefore, TAfter>,
): BingoLifecycleDecision<TAfter> {
  const changedFields = changedLockedFields(context);
  if (!frozen || changedFields.length === 0) {
    return { allowed: true, value: context.after };
  }

  return { allowed: false, code, details: { changedFields } };
}

export function evaluateEventConfigurationChange<
  TBefore extends CriticalConfiguration,
  TAfter extends CriticalConfiguration,
>(
  status: BingoEventStatus,
  configurationLockedAt: Date | null,
  context: ConfigurationFreezeContext<TBefore, TAfter>,
): BingoLifecycleDecision<TAfter> {
  return evaluateFrozenChange(
    isEventConfigurationFrozen(status, configurationLockedAt),
    BingoLifecycleErrorCode.EVENT_CONFIGURATION_LOCKED,
    context,
  );
}

export function evaluateRoundConfigurationChange<
  TBefore extends CriticalConfiguration,
  TAfter extends CriticalConfiguration,
>(
  status: BingoRoundStatus,
  configurationLockedAt: Date | null,
  context: ConfigurationFreezeContext<TBefore, TAfter>,
): BingoLifecycleDecision<TAfter> {
  return evaluateFrozenChange(
    isRoundConfigurationFrozen(status, configurationLockedAt),
    BingoLifecycleErrorCode.ROUND_CONFIGURATION_LOCKED,
    context,
  );
}

export function evaluatePatternConfigurationChange<
  TBefore extends CriticalConfiguration,
  TAfter extends CriticalConfiguration,
>(
  roundStatus: BingoRoundStatus,
  roundConfigurationLockedAt: Date | null,
  context: ConfigurationFreezeContext<TBefore, TAfter>,
): BingoLifecycleDecision<TAfter> {
  return evaluateFrozenChange(
    isRoundConfigurationFrozen(roundStatus, roundConfigurationLockedAt),
    BingoLifecycleErrorCode.PATTERN_CONFIGURATION_LOCKED,
    context,
  );
}
