import { EligibilityDecision } from "./eligibility";
import { IdentityResolution } from "./identity-resolution";

export type ParticipantStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export type Participant = Readonly<{
  id: string;
  eventId: string;
  subjectKey: string;
  identityKind: IdentityResolution["kind"];
  status: ParticipantStatus;
  eligibilityCode: EligibilityDecision["code"];
  approvedAt?: Date;
}>;

export type ParticipantDecision =
  | Readonly<{
      accepted: true;
      code: "PARTICIPANT_APPROVED";
      participant: Participant;
    }>
  | Readonly<{
      accepted: false;
      code:
        | "ELIGIBILITY_DENIED"
        | "ELIGIBILITY_SCOPE_MISMATCH"
        | "INVALID_PARTICIPANT_ID";
    }>;

export function approveParticipant(
  input: Readonly<{
    participantId: string;
    eventId: string;
    identity: IdentityResolution;
    eligibility: EligibilityDecision;
    now: Date;
  }>,
): ParticipantDecision {
  if (input.participantId.trim() === "") {
    return { accepted: false, code: "INVALID_PARTICIPANT_ID" };
  }
  if (
    input.eligibility.eventId !== input.eventId ||
    input.eligibility.subjectKey !== input.identity.subjectKey
  ) {
    return { accepted: false, code: "ELIGIBILITY_SCOPE_MISMATCH" };
  }
  if (!input.eligibility.eligible) {
    return { accepted: false, code: "ELIGIBILITY_DENIED" };
  }
  return {
    accepted: true,
    code: "PARTICIPANT_APPROVED",
    participant: {
      id: input.participantId,
      eventId: input.eventId,
      subjectKey: input.identity.subjectKey,
      identityKind: input.identity.kind,
      status: "APPROVED",
      eligibilityCode: input.eligibility.code,
      approvedAt: new Date(input.now.getTime()),
    },
  };
}
