import type { AuthenticatedRequest } from "../../modules/auth/types/request-user.type";
import type { RequestContext } from "../../modules/auth/auth.service";

/** Shared by every controller that needs to thread ip/user-agent/request-id
 * through to SecurityEventService.record() or a domain service's
 * RequestContext parameter - extracted so this mapping exists exactly
 * once (originally duplicated between AuthController and
 * AdminUsersController). */
export function buildRequestContext(request: AuthenticatedRequest): RequestContext {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip ?? null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
    requestId: (request as AuthenticatedRequest & { requestId?: string }).requestId ?? null,
  };
}
