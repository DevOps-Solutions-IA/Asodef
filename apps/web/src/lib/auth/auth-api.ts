import { apiClient } from "../api-client";
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  CurrentUser,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  StatusResponse,
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
