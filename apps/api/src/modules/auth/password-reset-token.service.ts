import { randomBytes, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PasswordReset } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { parseDurationToMs } from "./token.service";
import type { EnvConfig } from "../../config/env.validation";

export interface PasswordResetRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface CreatePasswordResetResult {
  passwordReset: PasswordReset;
  rawToken: string;
}

/**
 * Mirrors SessionService's design for the same reasons: the raw token is
 * a 256-bit random value (never a JWT, never derived from anything
 * guessable), only its HMAC-SHA256 hash (keyed with a dedicated
 * PASSWORD_RESET_TOKEN_SECRET pepper, distinct from JWT_REFRESH_SECRET)
 * is ever persisted, and single-use is enforced by an atomic
 * `updateMany` claim rather than a read-then-write race.
 */
@Injectable()
export class PasswordResetTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashToken(rawToken: string): string {
    const pepper = this.configService.get("PASSWORD_RESET_TOKEN_SECRET", { infer: true });
    return createHmac("sha256", pepper).update(rawToken).digest("hex");
  }

  getTtlMs(): number {
    return parseDurationToMs(this.configService.get("PASSWORD_RESET_TOKEN_TTL", { infer: true }));
  }

  /**
   * Supersedes every previous unused, unexpired, non-superseded token for
   * this user (the documented invalidation policy: at most one active
   * token per user at a time), then creates a fresh one.
   */
  async createToken(userId: string, context: PasswordResetRequestContext): Promise<CreatePasswordResetResult> {
    const now = new Date();
    await this.prisma.passwordReset.updateMany({
      where: { userId, usedAt: null, supersededAt: null, expiresAt: { gt: now } },
      data: { supersededAt: now },
    });

    const rawToken = this.generateToken();
    const passwordReset = await this.prisma.passwordReset.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        requestIp: context.ipAddress ?? undefined,
        userAgent: context.userAgent ?? undefined,
        requestId: context.requestId ?? undefined,
        expiresAt: new Date(now.getTime() + this.getTtlMs()),
      },
    });

    return { passwordReset, rawToken };
  }

  async findByRawToken(rawToken: string): Promise<PasswordReset | null> {
    const tokenHash = this.hashToken(rawToken);
    return this.prisma.passwordReset.findUnique({ where: { tokenHash } });
  }

  /**
   * Atomically claims one-time use of `passwordReset`. Returns false if
   * it was already used (or superseded) by a concurrent request between
   * the caller's lookup and this call - the same claim-then-verify
   * pattern as SessionService.rotateSession, which is what makes "a
   * token may succeed only once" hold under a real race, not just in the
   * common case.
   */
  async claim(passwordReset: Pick<PasswordReset, "id">): Promise<boolean> {
    const result = await this.prisma.passwordReset.updateMany({
      where: { id: passwordReset.id, usedAt: null, supersededAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  isUsable(passwordReset: PasswordReset): boolean {
    if (passwordReset.usedAt) return false;
    if (passwordReset.supersededAt) return false;
    if (passwordReset.expiresAt.getTime() <= Date.now()) return false;
    return true;
  }
}
