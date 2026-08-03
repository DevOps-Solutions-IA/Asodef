import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedRequest } from "../types/request-user.type";

const SAFE_FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";

/** Runs after JwtAuthGuard. Requires the caller to hold at least one of
 * the declared role names - reserved for platform-governance actions tied
 * to a specific role (e.g. SUPER_ADMIN-only), not general authorization. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
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

    const hasAny = required.some((roleName) => user.roles.includes(roleName));
    if (!hasAny) {
      throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
    }
    return true;
  }
}
