/**
 * Mirrors the safe shapes apps/api's AuthController actually returns
 * (US-006/US-007) - kept in sync manually, same convention as
 * lib/api-error.ts's ApiErrorEnvelope note. Never includes a token field:
 * the access/refresh tokens live only in httpOnly cookies the frontend
 * never reads.
 */
export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}

export interface SessionMetadata {
  createdAt: string;
  lastUsedAt: string | null;
}

/** GET /api/v1/auth/me */
export interface CurrentUser extends SafeUser {
  roles: string[];
  permissions: string[];
  session: SessionMetadata;
}

export interface LoginSuccessResponse {
  user: SafeUser;
}

export interface MfaLoginChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  expiresAt: string;
}

/** POST /api/v1/auth/login */
export type LoginResponse = LoginSuccessResponse | MfaLoginChallengeResponse;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyMfaLoginRequest {
  challengeToken: string;
  code: string;
}

export type VerifyMfaLoginResponse = LoginSuccessResponse;

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

export interface MfaStatusResponse {
  required: boolean;
  enrolled: boolean;
  status: "NOT_ENROLLED" | "PENDING" | "ACTIVE" | "REVOKED";
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
}

export interface MfaEnrollmentResponse {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

export interface BeginMfaEnrollmentRequest {
  password: string;
}

export interface ConfirmMfaEnrollmentRequest {
  password: string;
  code: string;
}

export interface MfaRecoveryCodesResponse {
  recoveryCodes: string[];
}

export interface ManageMfaRequest {
  password: string;
  code: string;
}

export interface MfaStepUpResponse {
  verifiedAt: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  message: string;
}

export interface StatusResponse {
  status: "ok";
}

/**
 * Mirrors PasswordRecoveryErrorCode (apps/api/src/modules/auth/
 * password-recovery.types.ts) - the safe, non-enumerating error
 * categories reset-password/change-password can return in the response
 * body's `code` field alongside an already-safe `message`.
 */
export type PasswordRecoveryErrorCode =
  | "INVALID_OR_EXPIRED_TOKEN"
  | "TOKEN_ALREADY_USED"
  | "WEAK_PASSWORD"
  | "PASSWORD_REUSED"
  | "CURRENT_PASSWORD_INVALID"
  | "RATE_LIMITED"
  | "NOTIFICATION_UNAVAILABLE"
  | "GENERIC_FAILURE";
