import {
  BINGO_EVENT_CRITICAL_CONFIGURATION_FIELDS,
  changedLockedFields,
  evaluateEventConfigurationChange,
  evaluatePatternConfigurationChange,
  evaluateRoundConfigurationChange,
  isEventConfigurationFrozen,
  isRoundConfigurationFrozen,
} from "./configuration-freeze";
import { BINGO_EVENT_STATUSES, BINGO_ROUND_STATUSES } from "./state-machines";
import { BingoLifecycleErrorCode } from "./lifecycle-errors";

const eventBefore = {
  defaultValidationPolicy: "SIMPLE",
  eligibilityPolicy: "AFFILIATES",
  eligibilityRules: ["ACTIVE_AFFILIATE"],
  fairnessMode: "CRYPTO_RNG",
  maxCardsPerParticipant: 1,
  publicWinnerVisibility: "CARD_ONLY",
  retentionPolicy: { evidence: "CORPORATE_MINIMUM" },
  visibility: "AUTHORIZED_PARTICIPANTS",
} as const;

describe("Bingo configuration freeze", () => {
  it("freezes event configuration at an explicit lock or publication", () => {
    expect(isEventConfigurationFrozen("DRAFT", null)).toBe(false);
    expect(isEventConfigurationFrozen("CONFIGURED", null)).toBe(false);
    expect(isEventConfigurationFrozen("DRAFT", new Date(0))).toBe(true);

    for (const status of BINGO_EVENT_STATUSES.slice(2)) {
      expect(isEventConfigurationFrozen(status, null)).toBe(true);
    }
  });

  it("freezes round and pattern configuration from READY", () => {
    expect(isRoundConfigurationFrozen("DRAFT", null)).toBe(false);
    expect(isRoundConfigurationFrozen("DRAFT", new Date(0))).toBe(true);
    for (const status of BINGO_ROUND_STATUSES.slice(1)) {
      expect(isRoundConfigurationFrozen(status, null)).toBe(true);
    }
  });

  it("returns sorted structured changes and ignores object key order", () => {
    const after = {
      ...eventBefore,
      fairnessMode: "CRYPTO_RNG_COMMIT_REVEAL",
      maxCardsPerParticipant: 5,
      publicWinnerVisibility: "CARD_ONLY",
    } as const;
    const context = {
      before: eventBefore,
      after,
    };

    expect(
      changedLockedFields({
        ...context,
        lockedFields: BINGO_EVENT_CRITICAL_CONFIGURATION_FIELDS,
      }),
    ).toEqual(["fairnessMode", "maxCardsPerParticipant"]);
    expect(
      evaluateEventConfigurationChange("PUBLISHED", new Date(0), context),
    ).toEqual({
      allowed: false,
      code: BingoLifecycleErrorCode.EVENT_CONFIGURATION_LOCKED,
      details: { changedFields: ["fairnessMode", "maxCardsPerParticipant"] },
    });
  });

  it("allows editing critical event fields before the freeze", () => {
    const after = { ...eventBefore, maxCardsPerParticipant: 3 } as const;
    expect(
      evaluateEventConfigurationChange("CONFIGURED", null, {
        before: eventBefore,
        after,
      }),
    ).toEqual({ allowed: true, value: after });
  });

  it("allows non-critical metadata changes after freeze", () => {
    const before = { ...eventBefore, operationalNote: "one" };
    const after = { ...before, operationalNote: "two" };
    expect(
      evaluateEventConfigurationChange("IN_PROGRESS", new Date(0), {
        before,
        after,
      }),
    ).toEqual({ allowed: true, value: after });
  });

  it("blocks tie, validation and special-rule changes on a frozen round", () => {
    const before = {
      patterns: ["line-v1"],
      prizes: ["prize-a"],
      tiePolicyConfiguration: null,
      tiePolicy: "SPLIT_PRIZE",
      validationPolicy: "SIMPLE",
      specialRuleReference: null,
    } as const;
    const after = {
      ...before,
      tiePolicy: "PRECONFIGURED_SPECIAL_RULE",
      validationPolicy: "DUAL_CONTROL",
      specialRuleReference: "special-v1",
    } as const;
    expect(
      evaluateRoundConfigurationChange("READY", new Date(0), {
        before,
        after,
      }),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.ROUND_CONFIGURATION_LOCKED,
      details: {
        changedFields: [
          "specialRuleReference",
          "tiePolicy",
          "validationPolicy",
        ],
      },
    });
  });

  it("cannot weaken a canonical freeze with caller-controlled fields", () => {
    const after = { ...eventBefore, maxCardsPerParticipant: 5 } as const;
    const adversarialContext = {
      after,
      before: eventBefore,
      lockedFields: [] as const,
    };

    expect(
      evaluateEventConfigurationChange(
        "PUBLISHED",
        new Date(0),
        adversarialContext,
      ),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.EVENT_CONFIGURATION_LOCKED,
      details: { changedFields: ["maxCardsPerParticipant"] },
    });
  });

  it("blocks masks and pattern semantics on a frozen round", () => {
    const before = {
      kind: "LINE",
      requiredMatchCount: 1,
      masks: [31],
    } as const;
    const after = {
      kind: "LINE",
      requiredMatchCount: 2,
      masks: [31, 992],
    } as const;
    expect(
      evaluatePatternConfigurationChange("IN_PROGRESS", new Date(0), {
        before,
        after,
      }),
    ).toMatchObject({
      allowed: false,
      code: BingoLifecycleErrorCode.PATTERN_CONFIGURATION_LOCKED,
      details: { changedFields: ["masks", "requiredMatchCount"] },
    });
  });

  it("compares nested values, dates, bigint and arrays deterministically", () => {
    const before = {
      config: {
        z: [1, 2, { value: 3n }],
        a: new Date("2026-08-09T12:00:00.000Z"),
      },
    } as const;
    const after = {
      config: {
        a: new Date("2026-08-09T12:00:00.000Z"),
        z: [1, 2, { value: 3n }],
      },
    } as const;
    expect(
      changedLockedFields({ before, after, lockedFields: ["config"] }),
    ).toEqual([]);
  });
});
