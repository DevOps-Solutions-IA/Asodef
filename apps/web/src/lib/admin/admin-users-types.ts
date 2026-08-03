export type AdminUserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  status: AdminUserStatus;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  permissions: string[];
  updatedAt: string;
  lockedUntil: string | null;
  isLocked: boolean;
  passwordChangedAt: string | null;
  activeSessionCount: number;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type UserListSortField = "createdAt" | "email" | "lastLoginAt" | "status";

export interface ListUsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminUserStatus;
  role?: string;
  sortBy?: UserListSortField;
  sortOrder?: "asc" | "desc";
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  roles?: string[];
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  reason: string;
  expectedUpdatedAt?: string;
}

export interface RoleChangeInput {
  roleName: string;
  reason: string;
  preview?: boolean;
}

export interface RoleChangeResult {
  applied: boolean;
  alreadyAssigned?: boolean;
  alreadyAbsent?: boolean;
}

export interface AdminUserRolesResponse {
  assigned: string[];
  available: string[];
}

export type SessionRevocationReason =
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "REFRESH_TOKEN_REUSE_DETECTED"
  | "ADMIN_ACTION"
  | "PASSWORD_RESET"
  | "PASSWORD_CHANGED"
  | "EXPIRED_CLEANUP";

export interface AdminSessionSummary {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: SessionRevocationReason | null;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
  isCurrent: boolean;
}

export interface RevokeSessionInput {
  sessionId?: string;
  reason: string;
}

export interface SecurityEventsFilters {
  page?: number;
  pageSize?: number;
  type?: string;
  fromDate?: string;
  toDate?: string;
  requestId?: string;
}

export interface AdminSecurityEventSummary {
  id: string;
  type: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminSecurityEventListResponse {
  items: AdminSecurityEventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  suspendedUsers: number;
  lockedUsers: number;
  recentLoginFailures24h: number;
  activeSessions: number;
}
