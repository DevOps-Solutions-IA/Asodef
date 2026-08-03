import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import type { AuthenticatedRequest } from "../types/request-user.type";

const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";

/**
 * Runs after JwtAuthGuard (request.user must already be populated).
 * Requires *all* declared permission keys to be present - this grants a
 * capability only; it does not scope results to records the caller owns.
 * Row-level ownership (a CUSTOMER seeing only their own payments, etc.)
 * is the responsibility of each service, not this guard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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
      throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
    }
    return true;
  }
}
