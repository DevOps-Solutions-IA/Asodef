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
