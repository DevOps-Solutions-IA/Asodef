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
    const body = { code: publicCode(code), message: safeMessage(code) };
    const exception = toHttpException(code, body);
    const response = host.switchToHttp().getResponse();
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}

function toHttpException(code: string, body: object) {
  if (code.includes("FORBIDDEN")) return new ForbiddenException(body);
  if (code.includes("NOT_FOUND")) return new NotFoundException(body);
  if (
    code.includes("IN_PROGRESS") ||
    code.includes("IDEMPOTENCY") ||
    code.includes("ACTIVE_EXECUTION")
  ) {
    return new ConflictException(body);
  }
  if (code.includes("SEED_CUSTODY") || code.includes("FAIRNESS")) {
    return new ServiceUnavailableException(body);
  }
  return new UnprocessableEntityException(body);
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
