import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

function requestHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

@Injectable()
export class AdminBusinessIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(params: {
    actorUserId: string;
    operation: string;
    key?: string;
    payload: unknown;
    work: (tx: TransactionClient) => Promise<T>;
  }): Promise<T> {
    if (!params.key) return this.prisma.$transaction((tx) => params.work(tx));
    if (!/^[A-Za-z0-9._:-]{16,100}$/.test(params.key)) throw new BadRequestException("Idempotency-Key inválida.");
    const hash = requestHash(params.payload);
    const where = { actorUserId_operation_key: { actorUserId: params.actorUserId, operation: params.operation, key: params.key } };
    const existing = await this.prisma.adminIdempotency.findUnique({ where });
    if (existing) return this.replay<T>(existing.requestHash, hash, existing.response);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const raced = await tx.adminIdempotency.findUnique({ where });
        if (raced) return this.replay<T>(raced.requestHash, hash, raced.response);
        const response = await params.work(tx);
        await tx.adminIdempotency.create({
          data: { actorUserId: params.actorUserId, operation: params.operation, key: params.key!, requestHash: hash, response: response as Prisma.InputJsonValue },
        });
        return response;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const winner = await this.prisma.adminIdempotency.findUnique({ where });
      if (!winner) throw new ConflictException("Conflicto de idempotencia. Reintenta la solicitud.");
      return this.replay<T>(winner.requestHash, hash, winner.response);
    }
  }

  private replay<T>(storedHash: string, incomingHash: string, response: unknown): T {
    if (storedHash !== incomingHash) throw new ConflictException("La clave de idempotencia ya fue usada con otra solicitud.");
    return response as T;
  }
}
