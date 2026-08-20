import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export interface RequestWithId extends Request {
  requestId: string;
  correlationId: string;
}

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_SURFACE_PATTERN = /^\/api(?:\/v\d+)?\/(?:auth|admin)(?:\/|$)/;
const requestLogger = new Logger("HttpRequest");

/**
 * Establishes bounded, non-user-controlled request/correlation identifiers,
 * emits one structured completion event, and prevents authentication/admin
 * responses from being cached. Applied before guards/controllers so error
 * responses receive the same protections.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = validatedId(req.header("x-request-id")) ?? randomUUID();
  const correlationId = validatedId(req.header("x-correlation-id")) ?? requestId;
  const requestWithContext = req as RequestWithId & { user?: { id?: unknown } };
  requestWithContext.requestId = requestId;
  requestWithContext.correlationId = correlationId;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Correlation-Id", correlationId);

  if (SENSITIVE_SURFACE_PATTERN.test(req.path)) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }

  const startedAt = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const actorId = typeof requestWithContext.user?.id === "string" ? requestWithContext.user.id : undefined;
    requestLogger.log({
      event: "http_request_completed",
      requestId,
      correlationId,
      method: req.method,
      endpoint: routeTemplate(req),
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ...(actorId ? { actorId } : {}),
    });
  });

  next();
}

function validatedId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && REQUEST_ID_PATTERN.test(normalized) ? normalized.toLowerCase() : undefined;
}

function routeTemplate(req: Request): string {
  const route = req.route as { path?: unknown } | undefined;
  const routePath = typeof route?.path === "string" ? route.path : req.path;
  const endpoint = `${req.baseUrl ?? ""}${routePath}`;
  return Array.from(endpoint, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? "_" : character;
  }).join("").slice(0, 256);
}
