import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SelfServicePortal } from "@prisma/client";
import type { Request, Response } from "express";
import { selfServiceCookieName, SelfServiceSessionService, type SelfServicePrincipal } from "./self-service-session.service";

const PORTAL_METADATA = "selfServicePortal";
export const RequireSelfServicePortal = (portal: SelfServicePortal) => SetMetadata(PORTAL_METADATA, portal);

export interface SelfServiceRequest extends Request { selfService?: SelfServicePrincipal }

@Injectable()
export class SelfServiceSessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SelfServiceSessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SelfServiceRequest>();
    const portal = this.reflector.getAllAndOverride<SelfServicePortal | undefined>(PORTAL_METADATA, [context.getHandler(), context.getClass()]);
    const tokens = portal
      ? [request.cookies?.[selfServiceCookieName(portal)] as string | undefined]
      : [SelfServicePortal.AFFILIATE, SelfServicePortal.COMPANY]
          .map((candidate) => request.cookies?.[selfServiceCookieName(candidate)] as string | undefined)
          .filter((token): token is string => Boolean(token));
    if (tokens.length !== 1) throw new UnauthorizedException("Sesión de autoservicio no válida.");
    const token = tokens[0];
    const principal = await this.sessions.resolve(token, {
      ipAddress: request.ip || null,
      userAgent: request.get("user-agent") ?? null,
    });
    if (!principal) throw new UnauthorizedException("Sesión de autoservicio no válida.");
    if (portal && principal.portal !== portal) throw new ForbiddenException("La sesión no autoriza este portal.");
    request.selfService = principal;
    return true;
  }
}

@Injectable()
export class SelfServiceCsrfGuard implements CanActivate {
  constructor(private readonly sessions: SelfServiceSessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SelfServiceRequest>();
    const token = request.headers["x-csrf-token"];
    const nextToken = request.selfService
      ? await this.sessions.consumeCsrf(request.selfService, typeof token === "string" ? token : undefined)
      : null;
    if (!nextToken) {
      throw new ForbiddenException("Token CSRF no válido.");
    }
    context.switchToHttp().getResponse<Response>().setHeader("x-csrf-token", nextToken);
    return true;
  }
}
