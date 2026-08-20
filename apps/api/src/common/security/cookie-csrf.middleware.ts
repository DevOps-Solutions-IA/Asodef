import { ForbiddenException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAFE_MESSAGE = "La solicitud no superó la validación de origen.";

/**
 * Defense in depth for cookie-authenticated mutations. SameSite=Strict is
 * the primary browser control; this middleware additionally rejects an
 * explicit cross-site Fetch Metadata signal and any supplied Origin that
 * is not in the same allowlist as CORS. Requests without authentication
 * cookies are unaffected (login, password recovery and provider webhooks).
 */
export function cookieCsrfMiddleware(
  allowedOrigins: readonly string[],
  authCookieNames: readonly string[],
) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method) || !hasAnyCookie(req, authCookieNames)) {
      next();
      return;
    }

    const fetchSite = req.header("sec-fetch-site")?.trim().toLowerCase();
    const origin = req.header("origin")?.trim();
    if (fetchSite === "cross-site" || (origin && !allowed.has(origin))) {
      next(new ForbiddenException({ code: "CSRF_ORIGIN_REJECTED", message: SAFE_MESSAGE }));
      return;
    }
    next();
  };
}

function hasAnyCookie(req: Request, names: readonly string[]): boolean {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  return names.some((name) => typeof cookies?.[name] === "string");
}
