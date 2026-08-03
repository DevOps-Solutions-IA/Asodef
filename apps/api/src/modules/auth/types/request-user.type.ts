import type { Request } from "express";
import type { UserStatus } from "@prisma/client";

/**
 * Attached to `request.user` by JwtAuthGuard after verifying the access
 * token and loading fresh role/permission data. Deliberately excludes
 * anything sensitive (password hash, refresh-token hash, ...) - this is
 * the *only* shape of "the current user" any controller/guard ever sees.
 */
export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

/** Express's Request augmented with the field JwtAuthGuard populates. */
export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}
