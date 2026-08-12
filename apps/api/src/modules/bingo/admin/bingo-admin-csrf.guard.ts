import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import type { EnvConfig } from "../../../config/env.validation";
import { parseCorsOrigins } from "../../../config/cors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Isolated defence-in-depth for cookie-authenticated Bingo admin commands.
 * ASODEF's auth cookie is already SameSite=Strict; this guard additionally
 * requires an exact trusted browser Origin for every unsafe request. It never
 * treats a missing Origin as trusted, which keeps non-browser integrations
 * from accidentally bypassing the browser CSRF boundary.
 */
@Injectable()
export class BingoAdminCsrfGuard implements CanActivate {
  private readonly trustedOrigins: ReadonlySet<string>;

  constructor(config: ConfigService<EnvConfig, true>) {
    const configured = parseCorsOrigins(
      config.get("CORS_ORIGIN", { infer: true }),
    );
    const publicApp = config.get("PUBLIC_APP_URL", { infer: true });
    this.trustedOrigins = new Set(
      [...configured, publicApp].map((value) => new URL(value).origin),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const origin = request.header("origin");
    const fetchSite = request.header("sec-fetch-site");
    if (
      origin === undefined ||
      !this.trustedOrigins.has(normalizeOrigin(origin)) ||
      (fetchSite !== undefined && fetchSite !== "same-origin")
    ) {
      throw new ForbiddenException("Solicitud administrativa no autorizada.");
    }
    return true;
  }
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
