import type { WinnerCandidate } from "./candidate";

export type CandidateValidationPolicy = "SIMPLE" | "DUAL_CONTROL";
export type CandidateValidationAction = "APPROVE" | "REJECT";
export type CandidateValidationCode =
  | "CANDIDATE_VALIDATED"
  | "CANDIDATE_REJECTED"
  | "VALIDATOR_NOT_AUTHORIZED"
  | "DUAL_CONTROL_ACTOR_CONFLICT"
  | "REJECTION_REASON_REQUIRED"
  | "INVALID_VALIDATION_TIMESTAMP";

export interface ValidatedCandidate {
  readonly candidate: WinnerCandidate;
  readonly status: "VALIDATED" | "REJECTED";
  readonly policy: CandidateValidationPolicy;
  readonly validatorActorId: string;
  readonly validatedAt: Date;
  readonly rejectionReason?: string;
}

export type CandidateValidationDecision =
  | Readonly<{
      accepted: true;
      code: "CANDIDATE_VALIDATED" | "CANDIDATE_REJECTED";
      result: ValidatedCandidate;
    }>
  | Readonly<{
      accepted: false;
      code: Exclude<
        CandidateValidationCode,
        "CANDIDATE_VALIDATED" | "CANDIDATE_REJECTED"
      >;
    }>;

export function validateCandidate(
  input: Readonly<{
    candidate: WinnerCandidate;
    policy: CandidateValidationPolicy;
    operatorActorId: string;
    validatorActorId: string;
    validatorAuthorized: boolean;
    action: CandidateValidationAction;
    rejectionReason?: string;
    now: Date;
  }>,
): CandidateValidationDecision {
  if (!input.validatorAuthorized || input.validatorActorId.trim() === "") {
    return { accepted: false, code: "VALIDATOR_NOT_AUTHORIZED" };
  }
  if (
    input.policy === "DUAL_CONTROL" &&
    input.validatorActorId === input.operatorActorId
  ) {
    return { accepted: false, code: "DUAL_CONTROL_ACTOR_CONFLICT" };
  }
  if (!Number.isFinite(input.now.getTime())) {
    return { accepted: false, code: "INVALID_VALIDATION_TIMESTAMP" };
  }
  if (input.action === "REJECT" && input.rejectionReason?.trim() === "") {
    return { accepted: false, code: "REJECTION_REASON_REQUIRED" };
  }
  if (input.action === "REJECT" && input.rejectionReason === undefined) {
    return { accepted: false, code: "REJECTION_REASON_REQUIRED" };
  }
  const rejected = input.action === "REJECT";
  return {
    accepted: true,
    code: rejected ? "CANDIDATE_REJECTED" : "CANDIDATE_VALIDATED",
    result: Object.freeze({
      candidate: input.candidate,
      policy: input.policy,
      rejectionReason: rejected ? input.rejectionReason!.trim() : undefined,
      status: rejected ? "REJECTED" : "VALIDATED",
      validatedAt: new Date(input.now.getTime()),
      validatorActorId: input.validatorActorId,
    }),
  };
}
