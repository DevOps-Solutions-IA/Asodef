import { apiClient } from "../api-client";
import type {
  AdminSecurityEventListResponse,
  AdminSessionSummary,
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserRolesResponse,
  CreateUserInput,
  ListUsersFilters,
  RevokeSessionInput,
  RoleChangeInput,
  RoleChangeResult,
  SecurityEventsFilters,
  UpdateUserInput,
  AdminUserStats,
} from "./admin-users-types";

/** Builds a query string from a plain filters object, skipping
 * undefined/empty values - the first GET-with-filters usage in this
 * codebase, so this small helper lives alongside its only caller rather
 * than in the shared api-client (which stays request-shape-agnostic). */
function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getUserStats(signal?: AbortSignal): Promise<AdminUserStats> {
  return apiClient.get<AdminUserStats>("/admin/users/stats", { signal });
}

export function listUsers(filters: ListUsersFilters, signal?: AbortSignal): Promise<AdminUserListResponse> {
  return apiClient.get<AdminUserListResponse>(`/admin/users${toQueryString(filters)}`, { signal });
}

export function getUserDetail(userId: string, signal?: AbortSignal): Promise<AdminUserDetail> {
  return apiClient.get<AdminUserDetail>(`/admin/users/${userId}`, { signal });
}

export function createUser(input: CreateUserInput): Promise<AdminUserDetail> {
  return apiClient.post<AdminUserDetail>("/admin/users", input);
}

export function updateUser(userId: string, input: UpdateUserInput): Promise<AdminUserDetail> {
  return apiClient.patch<AdminUserDetail>(`/admin/users/${userId}`, input);
}

export function deactivateUser(userId: string, reason: string): Promise<AdminUserDetail> {
  return apiClient.post<AdminUserDetail>(`/admin/users/${userId}/deactivate`, { reason });
}

export function reactivateUser(userId: string, reason: string): Promise<AdminUserDetail> {
  return apiClient.post<AdminUserDetail>(`/admin/users/${userId}/reactivate`, { reason });
}

export function unlockUser(userId: string, reason: string): Promise<{ applied: boolean; alreadyUnlocked?: boolean }> {
  return apiClient.post(`/admin/users/${userId}/unlock`, { reason });
}

export function getUserRoles(userId: string, signal?: AbortSignal): Promise<AdminUserRolesResponse> {
  return apiClient.get<AdminUserRolesResponse>(`/admin/users/${userId}/roles`, { signal });
}

export function assignUserRole(userId: string, input: RoleChangeInput): Promise<RoleChangeResult> {
  return apiClient.post<RoleChangeResult>(`/admin/users/${userId}/roles`, input);
}

export function revokeUserRole(userId: string, input: RoleChangeInput): Promise<RoleChangeResult> {
  return apiClient.post<RoleChangeResult>(`/admin/users/${userId}/roles/revoke`, input);
}

export function listUserSessions(userId: string, signal?: AbortSignal): Promise<AdminSessionSummary[]> {
  return apiClient.get<AdminSessionSummary[]>(`/admin/users/${userId}/sessions`, { signal });
}

export function revokeUserSessions(userId: string, input: RevokeSessionInput): Promise<{ revokedCount: number }> {
  return apiClient.post(`/admin/users/${userId}/sessions/revoke`, input);
}

export function listUserSecurityEvents(
  userId: string,
  filters: SecurityEventsFilters,
  signal?: AbortSignal,
): Promise<AdminSecurityEventListResponse> {
  return apiClient.get<AdminSecurityEventListResponse>(`/admin/users/${userId}/security-events${toQueryString(filters)}`, { signal });
}
