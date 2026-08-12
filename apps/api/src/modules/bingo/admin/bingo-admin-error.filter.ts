import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { BingoDrawError } from "../application/draws";
import { BingoIdempotencyError } from "../application/idempotency";
import { BingoApplicationError } from "../application/kernel";
import { BingoOutcomeApplicationError } from "../application/outcomes";
import { BingoRestartError } from "../application/restart";

type StructuredBingoError =
  | BingoApplicationError
  | BingoDrawError
  | BingoIdempotencyError
  | BingoOutcomeApplicationError
  | BingoRestartError;

@Catch(
  BingoApplicationError,
  BingoDrawError,
  BingoIdempotencyError,
  BingoOutcomeApplicationError,
  BingoRestartError,
)
export class BingoAdminErrorFilter implements ExceptionFilter {
  catch(error: StructuredBingoError, host: ArgumentsHost): void {
    const code = error.code;
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();
    const exception = toHttpException(code);
    const statusCode = exception.getStatus();
    response.status(statusCode).json({
      statusCode,
      error: errorName(statusCode),
      message: safeMessage(code),
      code: publicCode(code),
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
    });
  }
}

function toHttpException(code: string) {
  if (code.includes("FORBIDDEN")) return new ForbiddenException();
  if (code.includes("NOT_FOUND")) return new NotFoundException();
  if (
    code.includes("IN_PROGRESS") ||
    code.includes("IDEMPOTENCY") ||
    code.includes("ACTIVE_EXECUTION")
  ) {
    return new ConflictException();
  }
  if (code.includes("SEED_CUSTODY") || code.includes("FAIRNESS")) {
    return new ServiceUnavailableException();
  }
  return new UnprocessableEntityException();
}

function errorName(statusCode: number): string {
  return (
    {
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Unprocessable Entity",
      503: "Service Unavailable",
    }[statusCode] ?? "Error"
  );
}

function publicCode(code: string): string {
  if (code.includes("NO_BALLS")) return "BINGO_NO_BALLS_REMAINING";
  if (code.includes("IDEMPOTENCY")) return "BINGO_IDEMPOTENCY_CONFLICT";
  if (code.includes("IN_PROGRESS")) return "BINGO_COMMAND_IN_PROGRESS";
  if (code.includes("FORBIDDEN")) return "BINGO_FORBIDDEN";
  if (code.includes("NOT_FOUND")) return "BINGO_NOT_FOUND";
  if (code.includes("DUAL_CONTROL")) return "BINGO_DUAL_CONTROL_REQUIRED";
  if (code.includes("FAIRNESS") || code.includes("SEED_CUSTODY")) {
    return "BINGO_FAIRNESS_UNAVAILABLE";
  }
  if (code.includes("STATE") || code.includes("CONFIGURATION")) {
    return "BINGO_INVALID_STATE_TRANSITION";
  }
  return "BINGO_CONFLICT";
}

function safeMessage(code: string): string {
  if (code.includes("NOT_FOUND")) return "El recurso Bingo no existe.";
  if (code.includes("FORBIDDEN")) return "No tienes permisos para esta operación.";
  if (code.includes("NO_BALLS")) return "No quedan balotas disponibles.";
  if (code.includes("IN_PROGRESS")) return "El comando ya está en proceso.";
  if (code.includes("IDEMPOTENCY")) return "La clave de idempotencia entra en conflicto.";
  if (code.includes("SEED_CUSTODY") || code.includes("FAIRNESS")) {
    return "El modo de imparcialidad configurado no está disponible.";
  }
  return "La operación no es válida en el estado actual.";
}
