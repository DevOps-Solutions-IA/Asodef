import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import type { RequestWithId } from "../logging/request-id.middleware";

const STATUS_NAMES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

/**
 * Every error response - expected (HttpException) or not - is normalized to
 * the same envelope: { statusCode, error, message, path, timestamp,
 * requestId }. Stack traces are logged server-side only, never returned to
 * the client, and an unexpected (non-HttpException) error is reported to
 * the caller as a generic message in production so internals never leak.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & Partial<RequestWithId>>();
    const isProduction = process.env.NODE_ENV === "production";

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorName = STATUS_NAMES[statusCode] ?? "Error";

    let message: unknown;
    let extra: Record<string, unknown> = {};

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const body = exceptionResponse as Record<string, unknown>;
        message = body.message ?? exception.message;
        extra = Object.fromEntries(
          Object.entries(body).filter(([key]) => key !== "message" && key !== "error" && key !== "statusCode"),
        );
      } else {
        message = exceptionResponse;
      }
    } else {
      message = isProduction ? "Internal server error" : (exception as Error)?.message;
    }

    if (statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.originalUrl ?? request.url} -> ${statusCode}`,
        stack,
        request.requestId,
      );
    }

    response.status(statusCode).json({
      statusCode,
      error: errorName,
      message,
      ...extra,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
    });
  }
}
