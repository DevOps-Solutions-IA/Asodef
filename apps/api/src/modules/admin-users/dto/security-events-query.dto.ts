import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { SecurityEventType } from "@prisma/client";

// Kept as a plain string list (rather than importing the full Prisma
// enum object) so class-validator's @IsIn has a concrete array to check
// against; the DTO field is still typed against the real Prisma union.
const SECURITY_EVENT_TYPES = [
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "ACCOUNT_LOCKED",
  "ACCOUNT_UNLOCKED",
  "SESSION_CREATED",
  "SESSION_REFRESHED",
  "REFRESH_TOKEN_REUSE_DETECTED",
  "SESSION_REVOKED",
  "LOGOUT",
  "LOGOUT_ALL",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_TOKEN_CREATED",
  "PASSWORD_RESET_SUCCEEDED",
  "PASSWORD_RESET_FAILED",
  "PASSWORD_RESET_TOKEN_EXPIRED",
  "PASSWORD_RESET_TOKEN_REUSED",
  "PASSWORD_CHANGED",
  "PASSWORD_CHANGE_FAILED",
  "PASSWORD_SESSIONS_REVOKED",
  "PASSWORD_NOTIFICATION_FAILED",
  "AUTHORIZATION_DENIED",
  "ROLE_ASSIGNED",
  "ROLE_REMOVED",
  "PERMISSION_GRANTED",
  "PERMISSION_REVOKED",
  "GOVERNANCE_CHANGE_ATTEMPTED",
  "SCOPE_VIOLATION_ATTEMPTED",
  "LOCKOUT_EXPIRED",
  "LOCKOUT_RATE_LIMITED",
  "ACCOUNT_UNLOCK_FAILED",
  "ADMINISTRATIVE_UNLOCK",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
] as const;

export class SecurityEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(SECURITY_EVENT_TYPES)
  type?: SecurityEventType;

  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}
