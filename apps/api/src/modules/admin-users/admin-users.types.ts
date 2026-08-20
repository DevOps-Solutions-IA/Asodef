import type { Session, SecurityEvent, SecurityEventType, SessionRevocationReason, User, UserStatus } from "@prisma/client";

export interface AdminUserSummary {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  permissions: string[];
  version: number;
  updatedAt: Date;
  lockedUntil: Date | null;
  isLocked: boolean;
  passwordChangedAt: Date | null;
  activeSessionCount: number;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSessionSummary {
  id: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevocationReason | null;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
  isCurrent: boolean;
}

export interface AdminSecurityEventSummary {
  id: string;
  type: SecurityEventType;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AdminSecurityEventListResponse {
  items: AdminSecurityEventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserRolesResponse {
  assigned: string[];
  available: string[];
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

/**
 * Privacy-safe IP truncation for admin-facing responses (US-011 section
 * 10/15: "coarse IP representation according to privacy policy"). The
 * raw IP is still captured at write-time in the DB for genuine security
 * investigation - only the *admin list/detail view* ever sees the
 * truncated form.
 */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const groups = ip.split(":").filter((part) => part.length > 0);
    return `${groups.slice(0, 2).join(":")}::`;
  }
  const octets = ip.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  }
  return ip;
}

export function toAdminUserSummary(user: User & { roles: { role: { name: string } }[] }): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    roles: user.roles.map((r) => r.role.name),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function toAdminUserDetail(
  user: User & { roles: { role: { name: string } }[] },
  permissions: string[],
  activeSessionCount: number,
): AdminUserDetail {
  return {
    ...toAdminUserSummary(user),
    permissions,
    version: user.version,
    updatedAt: user.updatedAt,
    lockedUntil: user.lockedUntil,
    isLocked: !!user.lockedUntil && user.lockedUntil.getTime() > Date.now(),
    passwordChangedAt: user.passwordChangedAt,
    activeSessionCount,
  };
}

export function toAdminSessionSummary(session: Session, currentSessionId: string | undefined): AdminSessionSummary {
  const isActive = !session.revokedAt && !session.rotatedAt && session.expiresAt.getTime() > Date.now();
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    revokedReason: session.revokedReason,
    ipAddress: maskIp(session.ipAddress),
    userAgent: session.userAgent,
    isActive,
    isCurrent: session.id === currentSessionId,
  };
}

export function toAdminSecurityEventSummary(event: SecurityEvent): AdminSecurityEventSummary {
  return {
    id: event.id,
    type: event.type,
    ipAddress: maskIp(event.ipAddress),
    userAgent: event.userAgent,
    requestId: event.requestId,
    metadata: (event.metadata as Record<string, unknown> | null) ?? null,
    createdAt: event.createdAt,
  };
}
