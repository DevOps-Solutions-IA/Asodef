import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import type { RequestWithId } from "../logging/request-id.middleware";

export type ErrorClassification =
  | "VALIDATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "DEPENDENCY"
  | "TIMEOUT"
  | "DATA_INTEGRITY"
  | "TRANSIENT"
  | "UNKNOWN";

interface ErrorDescriptor {
  code: string;
  classification: ErrorClassification;
}

const ERROR_DESCRIPTORS: Record<number, ErrorDescriptor> = {
  400: { code: "VALIDATION_ERROR", classification: "VALIDATION" },
  401: { code: "AUTHENTICATION_REQUIRED", classification: "AUTHENTICATION" },
  403: { code: "ACCESS_DENIED", classification: "AUTHORIZATION" },
  404: { code: "RESOURCE_NOT_FOUND", classification: "VALIDATION" },
  408: { code: "REQUEST_TIMEOUT", classification: "TIMEOUT" },
  409: { code: "CONFLICT", classification: "CONFLICT" },
  422: { code: "VALIDATION_ERROR", classification: "VALIDATION" },
  429: { code: "RATE_LIMITED", classification: "RATE_LIMIT" },
  502: { code: "DEPENDENCY_ERROR", classification: "DEPENDENCY" },
  503: { code: "DEPENDENCY_UNAVAILABLE", classification: "DEPENDENCY" },
  504: { code: "DEPENDENCY_TIMEOUT", classification: "TIMEOUT" },
  500: { code: "INTERNAL_ERROR", classification: "UNKNOWN" },
};

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const ERROR_CLASSIFICATIONS = new Set<ErrorClassification>([
  "VALIDATION", "AUTHENTICATION", "AUTHORIZATION", "CONFLICT", "RATE_LIMIT",
  "DEPENDENCY", "TIMEOUT", "DATA_INTEGRITY", "TRANSIENT", "UNKNOWN",
]);

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
      message = "Internal server error";
    }

    const defaultDescriptor = ERROR_DESCRIPTORS[statusCode] ?? { code: "HTTP_ERROR", classification: "UNKNOWN" as const };
    const suppliedCode = extra.code;
    const suppliedClassification = extra.classification;
    const code = typeof suppliedCode === "string" && ERROR_CODE_PATTERN.test(suppliedCode)
      ? suppliedCode
      : defaultDescriptor.code;
    const classification = typeof suppliedClassification === "string" && ERROR_CLASSIFICATIONS.has(suppliedClassification as ErrorClassification)
      ? suppliedClassification as ErrorClassification
      : defaultDescriptor.classification;
    delete extra.code;
    delete extra.classification;

    if (statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.path} -> ${statusCode}`,
        stack,
        request.requestId,
      );
    }

    response.status(statusCode).json({
      statusCode,
      error: errorName,
      message,
      code,
      // Enterprise aliases retained alongside the established fields so
      // clients can migrate without a breaking error-envelope cutover.
      errorCode: code,
      safeMessage: message,
      classification,
      ...extra,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
  }
}
