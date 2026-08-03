/**
 * Stable, safe user-facing error categories for the password-recovery
 * flows (US-007 section 11). None of these leak account existence,
 * internal database state, or cryptographic error detail - the frontend
 * (a later story) can switch on `code` without ever seeing a raw error.
 */
export enum PasswordRecoveryErrorCode {
  INVALID_OR_EXPIRED_TOKEN = "INVALID_OR_EXPIRED_TOKEN",
  TOKEN_ALREADY_USED = "TOKEN_ALREADY_USED",
  WEAK_PASSWORD = "WEAK_PASSWORD",
  PASSWORD_REUSED = "PASSWORD_REUSED",
  CURRENT_PASSWORD_INVALID = "CURRENT_PASSWORD_INVALID",
  RATE_LIMITED = "RATE_LIMITED",
  // No code path in this story returns this synchronously today (mail
  // dispatch is fire-and-forget, strictly after the HTTP response) - kept
  // for contract completeness/future use (e.g. a future "resend" flow).
  NOTIFICATION_UNAVAILABLE = "NOTIFICATION_UNAVAILABLE",
  GENERIC_FAILURE = "GENERIC_FAILURE",
}

export class PasswordRecoveryException extends Error {
  constructor(
    public readonly code: PasswordRecoveryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// --- Typed request/response contracts (US-007 section 11) - stable
// shapes a future frontend story can import as-is. ---

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
