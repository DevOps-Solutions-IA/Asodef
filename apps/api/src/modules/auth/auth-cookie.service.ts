import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Response } from "express";
import type { EnvConfig } from "../../config/env.validation";
import { parseDurationToMs } from "./token.service";

/**
 * The one place cookie names/flags/paths are decided. Nothing in the auth
 * services hardcodes "asodef.com.co" or any other domain - COOKIE_DOMAIN
 * is an explicit, optional env var that stays empty unless a deployment
 * genuinely needs it (the default asodef.com.co/api path-based
 * architecture does not: leaving Domain unset scopes the cookie to
 * whichever host actually served the response, which is exactly right for
 * a single-domain deployment behind Nginx).
 */
@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  private get isProduction(): boolean {
    return this.configService.get("NODE_ENV", { infer: true }) === "production";
  }

  get accessTokenCookieName(): string {
    return this.configService.get("COOKIE_ACCESS_TOKEN_NAME", { infer: true });
  }

  get refreshTokenCookieName(): string {
    return this.configService.get("COOKIE_REFRESH_TOKEN_NAME", { infer: true });
  }

  private baseOptions(): CookieOptions {
    const domain = this.configService.get("COOKIE_DOMAIN", { infer: true });
    return {
      httpOnly: true,
      secure: this.isProduction,
      // Same-origin, path-based architecture (frontend and API share
      // asodef.com.co) - Strict is the most restrictive setting that
      // still works, since these cookies are never needed on a
      // cross-site request.
      sameSite: "strict",
      ...(domain ? { domain } : {}),
    };
  }

  setAccessTokenCookie(response: Response, token: string): void {
    response.cookie(this.accessTokenCookieName, token, {
      ...this.baseOptions(),
      path: "/api",
      maxAge: parseDurationToMs(this.configService.get("JWT_ACCESS_TTL", { infer: true })),
    });
  }

  setRefreshTokenCookie(response: Response, token: string): void {
    response.cookie(this.refreshTokenCookieName, token, {
      ...this.baseOptions(),
      // Scoped narrower than the access token: only the auth endpoints
      // that actually need the refresh token ever receive this cookie.
      path: "/api/v1/auth",
      maxAge: parseDurationToMs(this.configService.get("JWT_REFRESH_TTL", { infer: true })),
    });
  }

  clearAuthCookies(response: Response): void {
    response.clearCookie(this.accessTokenCookieName, { ...this.baseOptions(), path: "/api" });
    response.clearCookie(this.refreshTokenCookieName, { ...this.baseOptions(), path: "/api/v1/auth" });
  }
}
