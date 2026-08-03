import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../database/prisma.service";
import { TokenService } from "../token.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedRequest, RequestUser } from "../types/request-user.type";
import type { EnvConfig } from "../../../config/env.validation";

const SAFE_AUTH_ERROR_MESSAGE = "No autenticado.";

/**
 * Registered as the global APP_GUARD (see AuthModule): the app is
 * deny-by-default, every route requires a valid access token unless
 * marked @Public(). Reads the access token from an httpOnly cookie, never
 * from an Authorization header or the URL - matching the "no token in
 * localStorage/sessionStorage/URLs" requirement, since there is
 * deliberately no client-readable copy of this token anywhere.
 *
 * US-008 permission-resolution/caching strategy: roles and permissions
 * are resolved from the database on *every request* (the query below) -
 * never embedded in the access token and never cached. This is a
 * deliberate choice, not an oversight:
 *   - Zero staleness window: a role/permission change (or account
 *     status change) takes effect on the very next request from any
 *     device, immediately - see guard-composition.integration.spec.ts's
 *     "no caching/staleness" tests for a concrete demonstration.
 *   - No cache-invalidation surface to get wrong: nothing to bust when
 *     RoleAssignmentService changes an assignment, no stale-cache class
 *     of bug to defend against.
 *   - Cost is one indexed PK lookup with two cheap joins (User ->
 *     UserRole -> Role -> RolePermission -> Permission, all walked via
 *     already-indexed foreign/primary keys - see schema.prisma), which is
 *     acceptable at this platform's scale.
 * If this ever becomes a measured bottleneck, the documented next step
 * is a short-TTL (30-60s) Redis cache keyed by userId, explicitly
 * invalidated by RoleAssignmentService on every assignment change -
 * not embedding permissions in the JWT itself, which would reintroduce
 * exactly the staleness/revocation problem this design avoids.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.configService.get("COOKIE_ACCESS_TOKEN_NAME", { infer: true });
    const token: unknown = request.cookies?.[cookieName];

    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedException(SAFE_AUTH_ERROR_MESSAGE);
    }

    let payload;
    try {
      payload = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException(SAFE_AUTH_ERROR_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException(SAFE_AUTH_ERROR_MESSAGE);
    }

    // US-007 design decision: access tokens are otherwise stateless
    // (verified by signature alone, no per-request session lookup), so an
    // already-issued token would normally stay valid until its own short
    // TTL lapses even after a password reset/change - exactly the gap
    // section 9 of the US-007 spec calls out. Comparing the token's `iat`
    // against User.passwordChangedAt closes that gap for this specific
    // high-risk event at zero extra cost (the user row is already loaded
    // here for roles/permissions on every request) without introducing a
    // general per-request session/blocklist lookup for every route.
    // `iat` has whole-second resolution (a JWT constraint) while
    // passwordChangedAt has millisecond resolution, so both sides are
    // compared at whole-second granularity - a token minted in the exact
    // same second as the password change is treated as valid rather than
    // rejected by sub-second luck. This matters in practice: the
    // documented change-password flow relies on the acting session's very
    // next /refresh call succeeding immediately, which can legitimately
    // land in the same wall-clock second as the change itself.
    const passwordChangedAtSeconds = user.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : null;
    if (passwordChangedAtSeconds !== null && payload.iat < passwordChangedAtSeconds) {
      throw new UnauthorizedException(SAFE_AUTH_ERROR_MESSAGE);
    }

    const roleNames = user.roles.map((userRole) => userRole.role.name);
    const permissionKeys = new Set<string>();
    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissionKeys.add(rolePermission.permission.key);
      }
    }

    const requestUser: RequestUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles: roleNames,
      permissions: Array.from(permissionKeys),
      sessionId: payload.sid,
    };

    request.user = requestUser;
    return true;
  }
}
