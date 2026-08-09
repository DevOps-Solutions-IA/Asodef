import {
  canAssignCard,
  canReassignCard,
  CardAssignmentContext,
} from "./assignment";
import { evaluateEligibility } from "./eligibility";
import { approveParticipant, Participant } from "./participant";

const NOW = new Date("2026-08-09T12:00:00.000Z");

const participant: Participant = {
  id: "participant-1",
  eventId: "event-1",
  subjectKey: "affiliate-1",
  identityKind: "AFFILIATE",
  status: "APPROVED",
  eligibilityCode: "ELIGIBLE",
  approvedAt: NOW,
};

const assignable: CardAssignmentContext = {
  eventId: "event-1",
  participant,
  cardEventId: "event-1",
  cardHasActiveAssignment: false,
  participantActiveCardCount: 0,
  maxCardsPerParticipant: 3,
  eventStatus: "PUBLISHED",
  roundStatus: "READY",
  execution: { status: "PLANNED" },
  now: NOW,
};

describe("Bingo participant creation", () => {
  const identity = {
    kind: "AFFILIATE" as const,
    subjectKey: "affiliate-1",
    affiliateId: "affiliate-1",
    affiliateStatus: "ACTIVE" as const,
  };
  const eligibility = evaluateEligibility({
    eventId: "event-1",
    policy: "AFFILIATES",
    identity,
    allowedPartnerCompanyIds: [],
    now: NOW,
  });

  it("creates an immutable event-scoped participant only from an eligible decision", () => {
    expect(
      approveParticipant({
        participantId: "participant-1",
        eventId: "event-1",
        identity,
        eligibility,
        now: NOW,
      }),
    ).toMatchObject({
      accepted: true,
      participant: { status: "APPROVED", eventId: "event-1" },
    });
  });

  it("rejects a decision issued for another subject or event", () => {
    expect(
      approveParticipant({
        participantId: "participant-1",
        eventId: "another-event",
        identity,
        eligibility,
        now: NOW,
      }),
    ).toEqual({ accepted: false, code: "ELIGIBILITY_SCOPE_MISMATCH" });
  });
});

describe("Bingo card assignment decisions", () => {
  it("allows assignment and reassignment before execution starts", () => {
    expect(canAssignCard(assignable)).toEqual({
      allowed: true,
      code: "ASSIGNMENT_ALLOWED",
    });
    expect(
      canAssignCard({
        ...assignable,
        execution: {
          status: "PLANNED",
          startedAt: new Date("2026-08-10T00:00:00.000Z"),
        },
      }),
    ).toEqual({ allowed: true, code: "ASSIGNMENT_ALLOWED" });
    expect(
      canReassignCard({
        ...assignable,
        cardHasActiveAssignment: true,
        currentAssignment: {
          eventId: "event-1",
          cardEventId: "event-1",
          status: "ACTIVE",
        },
        reason: "Authorized correction",
      }),
    ).toEqual({ allowed: true, code: "ASSIGNMENT_ALLOWED" });
  });

  it.each([
    [
      { participant: { ...participant, status: "WITHDRAWN" } },
      "PARTICIPANT_NOT_APPROVED",
    ],
    [
      { participant: { ...participant, eventId: "other" } },
      "PARTICIPANT_EVENT_MISMATCH",
    ],
    [{ cardEventId: "other" }, "CARD_EVENT_MISMATCH"],
    [{ cardHasActiveAssignment: true }, "CARD_ALREADY_ASSIGNED"],
    [{ maxCardsPerParticipant: 0 }, "INVALID_CARD_LIMIT"],
    [{ participantActiveCardCount: -1 }, "INVALID_ACTIVE_CARD_COUNT"],
    [{ participantActiveCardCount: 3 }, "CARD_LIMIT_REACHED"],
    [{ eventStatus: "IN_PROGRESS" }, "EVENT_NOT_ASSIGNABLE"],
    [{ roundStatus: "IN_PROGRESS" }, "ROUND_NOT_ASSIGNABLE"],
    [
      { execution: { status: "RUNNING", startedAt: NOW } },
      "EXECUTION_ALREADY_STARTED",
    ],
    [
      { execution: { status: "CANCELLED", startedAt: NOW } },
      "EXECUTION_ALREADY_STARTED",
    ],
  ] as const)("blocks assignment mutation %#", (mutation, code) => {
    expect(
      canAssignCard({ ...assignable, ...mutation } as CardAssignmentContext),
    ).toEqual({
      allowed: false,
      code,
    });
  });

  it.each([
    [{ status: "REVOKED" }, "CURRENT_ASSIGNMENT_NOT_ACTIVE"],
    [{ eventId: "other" }, "CURRENT_ASSIGNMENT_SCOPE_MISMATCH"],
    [{ cardEventId: "other" }, "CURRENT_ASSIGNMENT_SCOPE_MISMATCH"],
  ] as const)("blocks invalid current assignment %#", (mutation, code) => {
    expect(
      canReassignCard({
        ...assignable,
        currentAssignment: {
          eventId: "event-1",
          cardEventId: "event-1",
          status: "ACTIVE",
          ...mutation,
        },
        reason: "Correction",
      }),
    ).toEqual({ allowed: false, code });
  });

  it("requires a reassignment reason and rejects operation after start", () => {
    const currentAssignment = {
      eventId: "event-1",
      cardEventId: "event-1",
      status: "ACTIVE" as const,
    };
    expect(
      canReassignCard({
        ...assignable,
        currentAssignment,
        reason: "  ",
      }),
    ).toEqual({ allowed: false, code: "REASSIGNMENT_REASON_REQUIRED" });
    expect(
      canReassignCard({
        ...assignable,
        execution: { status: "PAUSED", startedAt: NOW },
        currentAssignment,
        reason: "Too late",
      }),
    ).toEqual({ allowed: false, code: "EXECUTION_ALREADY_STARTED" });
  });

  it("never allows a malformed active count in deterministic fuzz", () => {
    for (let count = -20; count <= 20; count += 1) {
      const result = canAssignCard({
        ...assignable,
        participantActiveCardCount: count,
        maxCardsPerParticipant: 5,
      });
      expect(result.allowed).toBe(count >= 0 && count < 5);
    }
  });
});
