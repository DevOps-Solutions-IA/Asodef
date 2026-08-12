import type { Prisma } from "@prisma/client";
import type {
  AcquireIdempotencyInput,
  BingoCommandResult,
  IdempotencyAcquisition,
} from "../idempotency";

export interface ExecutionIdempotencyPort {
  acquire(
    tx: Prisma.TransactionClient,
    input: AcquireIdempotencyInput,
  ): Promise<IdempotencyAcquisition>;
  succeed(
    tx: Prisma.TransactionClient,
    recordId: string,
    result: BingoCommandResult,
    now: Date,
  ): Promise<void>;
}
