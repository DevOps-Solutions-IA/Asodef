import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Assigns (or trusts an existing) X-Request-Id so every log line and error
 * response for a single request can be correlated. Applied as raw
 * app.use() middleware in main.ts so it runs before everything else,
 * including helmet/cors.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
