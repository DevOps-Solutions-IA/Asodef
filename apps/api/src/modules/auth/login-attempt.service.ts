import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { LoginFailureCategory, User } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";

export interface RecordAttemptInput {
  email: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  success: boolean;
  failureCategory?: LoginFailureCategory;
  requestId?: string | null;
}

/**
 * Owns both halves of lockout tracking: LoginAttempt rows (a full audit
 * trail, recordable even for unknown emails - userId stays null) and the
 * fast-path counters on User (failedLoginAttempts/lockedUntil), which is
 * what the login flow actually checks/updates. Deliberately separate from
 * SessionService/TokenService - this is pure account-standing logic, no
 * tokens involved.
 */
@Injectable()
export class LoginAttemptService {
  private readonly maxFailedAttempts: number;
  private readonly lockoutDurationMs: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<EnvConfig, true>,
  ) {
    this.maxFailedAttempts = configService.get("LOGIN_MAX_FAILED_ATTEMPTS", { infer: true });
    this.lockoutDurationMs = configService.get("LOGIN_LOCKOUT_DURATION_MINUTES", { infer: true }) * 60_000;
  }

  async recordAttempt(input: RecordAttemptInput): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email: input.email,
        userId: input.userId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        success: input.success,
        failureCategory: input.failureCategory,
        requestId: input.requestId ?? null,
      },
    });
  }

  /** A currently-locked account: lockedUntil is set and still in the future. */
  isLocked(user: Pick<User, "lockedUntil">): boolean {
    return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
  }

  /**
   * Increments the failure counter and locks the account once the
   * threshold is reached. Returns true the moment the account transitions
   * into a locked state (so the caller can emit ACCOUNT_LOCKED exactly
   * once, not on every subsequent failed attempt while still locked).
   */
  async registerFailedAttempt(userId: string): Promise<{ justLocked: boolean; lockedUntil: Date | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const nextCount = user.failedLoginAttempts + 1;
    const willLock = nextCount >= this.maxFailedAttempts && !this.isLocked(user);
    const lockedUntil = willLock ? new Date(Date.now() + this.lockoutDurationMs) : user.lockedUntil;

    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: nextCount, lockedUntil },
    });

    return { justLocked: willLock, lockedUntil: willLock ? lockedUntil : null };
  }

  /** Successful authentication resets the lockout state and stamps
   * lastLoginAt, per the approved security policy. */
  async registerSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }
}
