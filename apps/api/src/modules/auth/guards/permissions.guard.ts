import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { SecurityEventService } from "../../../common/security-events/security-event.service";
import type { AuthenticatedRequest } from "../types/request-user.type";

const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";

/**
 * Runs after JwtAuthGuard (request.user must already be populated).
 * Requires *all* declared permission keys to be present - this grants a
 * capability only; it does not scope results to records the caller owns.
 * Row-level ownership (a CUSTOMER seeing only their own payments, etc.)
 * is the responsibility of each service, not this guard - see
 * common/authorization/ for the reusable ownership/organization-scope
 * primitives services must apply explicitly (US-008).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityEventService: SecurityEventService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
    }

    const hasAll = required.every((key) => user.permissions.includes(key));
    if (!hasAll) {
      // Fire-and-forget: recording the denial must never delay or block
      // the 403 itself. The required permission keys are safe to record
      // here (internal audit trail, never echoed in the HTTP response -
      // see SAFE_FORBIDDEN_MESSAGE above, which is identical regardless
      // of which permission was missing).
      void this.securityEventService.record({
        type: "AUTHORIZATION_DENIED",
        userId: user.id,
        requestId: extractRequestId(request),
        metadata: { requiredPermissions: required.join(","), path: request.path, method: request.method },
      });
      throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
    }
    return true;
  }
}

function extractRequestId(request: AuthenticatedRequest): string | null {
  return (request as AuthenticatedRequest & { requestId?: string }).requestId ?? null;
}
