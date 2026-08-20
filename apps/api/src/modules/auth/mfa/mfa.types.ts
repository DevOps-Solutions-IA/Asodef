export type MfaErrorCode =
  | "MFA_NOT_AVAILABLE"
  | "MFA_ENROLLMENT_REQUIRED"
  | "MFA_ENROLLMENT_EXPIRED"
  | "MFA_ALREADY_ENABLED"
  | "MFA_INVALID_CODE"
  | "MFA_CHALLENGE_INVALID"
  | "MFA_CHALLENGE_EXPIRED"
  | "MFA_CHALLENGE_USED"
  | "MFA_ATTEMPTS_EXCEEDED"
  | "MFA_ADMIN_ONLY"
  | "MFA_PASSWORD_INVALID"
  | "MFA_CONFLICT";

export class MfaException extends Error {
  constructor(readonly code: MfaErrorCode, message: string) {
    super(message);
    this.name = "MfaException";
  }
}

/** Internal control-flow signal handled only by AuthController. It is never
 * logged and never creates authentication cookies or a Session. */
export class MfaRequiredException extends Error {
  constructor(
    readonly challengeToken: string,
    readonly expiresAt: Date,
  ) {
    super("Additional authentication is required.");
    this.name = "MfaRequiredException";
  }
}

export interface MfaStatus {
  required: boolean;
  enrolled: boolean;
  status: "NOT_ENROLLED" | "PENDING" | "ACTIVE" | "REVOKED";
  confirmedAt: Date | null;
  recoveryCodesRemaining: number;
}
