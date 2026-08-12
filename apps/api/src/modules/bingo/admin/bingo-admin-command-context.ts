import { BadRequestException } from "@nestjs/common";
import type { Request } from "express";

import type { RequestUser } from "../../auth/types/request-user.type";
import {
  hashIdempotencyKey,
  hashIdempotencyRequest,
} from "../application/idempotency";
import {
  SystemBingoClock,
  type CommandContext,
} from "../application/kernel";

export interface BingoAdminRequest extends Request {
  requestId?: string;
}

export function buildBingoCommandContext(
  request: BingoAdminRequest,
  user: RequestUser,
  canonicalCommand: unknown,
): CommandContext {
  const value = request.header("idempotency-key")?.trim();
  if (
    value === undefined ||
    value.length < 16 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new BadRequestException({
      code: "BINGO_VALIDATION_FAILED",
      message: "Idempotency-Key debe contener entre 16 y 200 caracteres seguros.",
    });
  }
  const requestId = request.requestId?.trim();
  if (!requestId) {
    throw new BadRequestException({
      code: "BINGO_VALIDATION_FAILED",
      message: "No fue posible resolver el requestId.",
    });
  }
  return {
    actor: { userId: user.id, permissions: new Set(user.permissions) },
    requestId,
    idempotencyKey: value,
    idempotencyKeyHash: hashIdempotencyKey(value),
    requestHash: hashIdempotencyRequest(canonicalCommand),
    clock: new SystemBingoClock(),
  };
}
