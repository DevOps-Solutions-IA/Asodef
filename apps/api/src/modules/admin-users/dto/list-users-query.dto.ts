import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { UserStatus } from "@prisma/client";

export const USER_LIST_SORT_FIELDS = ["createdAt", "email", "lastLoginAt", "status"] as const;
export type UserListSortField = (typeof USER_LIST_SORT_FIELDS)[number];

const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

export class ListUsersQueryDto {
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

  /** Matched against email/fullName only - never password, token, or
   * security metadata (US-011 section 4). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsIn(USER_LIST_SORT_FIELDS)
  sortBy?: UserListSortField;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}
