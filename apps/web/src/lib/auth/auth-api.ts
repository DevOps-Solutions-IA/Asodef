import { apiClient } from "../api-client";
import type {
  ChangePasswordRequest,
  BeginMfaEnrollmentRequest,
  ConfirmMfaEnrollmentRequest,
  ChangePasswordResponse,
  CurrentUser,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  ManageMfaRequest,
  MfaEnrollmentResponse,
  MfaRecoveryCodesResponse,
  MfaStepUpResponse,
  MfaStatusResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  StatusResponse,
  VerifyMfaLoginRequest,
  VerifyMfaLoginResponse,
} from "./auth-types";

/**
 * Thin, typed wrappers over the real backend endpoints - no auth logic
 * lives here (no token handling, no retry, no redirect). login/refresh/
 * logout/forgot-password/reset-password are marked skipAuthRefresh so a
 * 401 from any of them is never itself eligible to trigger the
 * refresh-and-retry cycle in api-client.ts (US-010 section 5) - refresh
 * failing would otherwise try to refresh via calling refresh again, and
 * login/forgot-password/reset-password failing has nothing to refresh
 * (no session exists yet). change-password and /me are intentionally NOT
 * marked - a 401 there (e.g. a concurrently-invalidated access token) is
 * exactly the case worth one retry after a silent refresh.
 */
export function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  return apiClient.get<CurrentUser | null>("/auth/me", { signal });
}

export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/login", input, { skipAuthRefresh: true });
}

export function verifyMfaLogin(input: VerifyMfaLoginRequest): Promise<VerifyMfaLoginResponse> {
  return apiClient.post<VerifyMfaLoginResponse>("/auth/mfa/verify-login", input, { skipAuthRefresh: true });
}

export function getMfaStatus(signal?: AbortSignal): Promise<MfaStatusResponse> {
  return apiClient.get<MfaStatusResponse>("/auth/mfa/status", { signal });
}

export function beginMfaEnrollment(input: BeginMfaEnrollmentRequest): Promise<MfaEnrollmentResponse> {
  return apiClient.post<MfaEnrollmentResponse>("/auth/mfa/enrollment", input);
}

export function confirmMfaEnrollment(input: ConfirmMfaEnrollmentRequest): Promise<MfaRecoveryCodesResponse> {
  return apiClient.post<MfaRecoveryCodesResponse>("/auth/mfa/enrollment/confirm", input);
}

export function verifyMfaStepUp(input: ManageMfaRequest): Promise<MfaStepUpResponse> {
  return apiClient.post<MfaStepUpResponse>("/auth/step-up", input);
}

export function regenerateMfaRecoveryCodes(): Promise<MfaRecoveryCodesResponse> {
  return apiClient.post<MfaRecoveryCodesResponse>("/auth/mfa/recovery-codes/regenerate");
}

export function revokeMfa(): Promise<StatusResponse> {
  return apiClient.post<StatusResponse>("/auth/mfa/revoke");
}

export function refreshSession(): Promise<StatusResponse> {
  return apiClient.post<StatusResponse>("/auth/refresh", undefined, { skipAuthRefresh: true });
}

export function logout(): Promise<StatusResponse> {
  return apiClient.post<StatusResponse>("/auth/logout", undefined, { skipAuthRefresh: true });
}

export function logoutAll(): Promise<StatusResponse> {
  return apiClient.post<StatusResponse>("/auth/logout-all");
}

export function forgotPassword(input: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return apiClient.post<ForgotPasswordResponse>("/auth/forgot-password", input, { skipAuthRefresh: true });
}

export function resetPassword(input: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  return apiClient.post<ResetPasswordResponse>("/auth/reset-password", input, { skipAuthRefresh: true });
}

export function changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return apiClient.post<ChangePasswordResponse>("/auth/change-password", input);
}
