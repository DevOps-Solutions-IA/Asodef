import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { LoginFailureCategory, Prisma, User } from "@prisma/client";
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

type LoginAttemptWriteClient = Pick<Prisma.TransactionClient, "loginAttempt" | "user">;

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

  async recordAttempt(input: RecordAttemptInput, client: LoginAttemptWriteClient = this.prisma): Promise<void> {
    await client.loginAttempt.create({
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
   * True the moment a *stale* lockout is observed - lockedUntil is set,
   * but has already passed. Exposed as a pure, synchronous check (US-009)
   * so AuthService can detect and record the automatic-unlock transition
   * exactly once, from the single call site that first sees the pre-
   * attempt state, regardless of whether the attempt that follows
   * succeeds or fails.
   */
  wasLockoutJustExpired(user: Pick<User, "lockedUntil">): boolean {
    return !!user.lockedUntil && user.lockedUntil.getTime() <= Date.now();
  }

  /**
   * Increments the failure counter and locks the account once the
   * threshold is reached. Returns true the moment the account transitions
   * into a locked state (so the caller can emit ACCOUNT_LOCKED exactly
   * once, not on every subsequent failed attempt while still locked).
   *
   * Concurrency-safe (US-009): a naive read-then-write (read
   * failedLoginAttempts, compute +1 in JS, write it back) loses updates
   * under real concurrent failed attempts - two requests can both read
   * the same count and both write the same incremented value, silently
   * absorbing one failure. This uses Prisma's atomic `{ increment: 1 }`
   * (a single `SET failed_login_attempts = failed_login_attempts + 1`
   * statement, safe under Postgres row-level locking) for the counter,
   * and the same null-guarded `updateMany` claim pattern already
   * established by SessionService.rotateSession/PasswordResetTokenService
   * for the one genuinely racy decision: which concurrent caller gets to
   * be the one that actually activates the lockout (and therefore reports
   * justLocked: true, so ACCOUNT_LOCKED is only ever recorded once).
   */
  async registerFailedAttempt(userId: string): Promise<{ justLocked: boolean; lockedUntil: Date | null }> {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (this.wasLockoutJustExpired(before)) {
      // Idempotent reset of stale state - safe even if a concurrent
      // request performs the exact same reset (both write the same
      // fixed values, not a compute-from-current-value increment).
      await this.prisma.user.updateMany({
        where: { id: userId, lockedUntil: { not: null } },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const afterIncrement = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (afterIncrement.lockedUntil) {
      // Already locked (either from before, or a concurrent request just
      // won the race below) - this call did not just lock the account.
      return { justLocked: false, lockedUntil: afterIncrement.lockedUntil };
    }

    if (afterIncrement.failedLoginAttempts < this.maxFailedAttempts) {
      return { justLocked: false, lockedUntil: null };
    }

    const lockedUntil = new Date(Date.now() + this.lockoutDurationMs);
    const claim = await this.prisma.user.updateMany({
      where: { id: userId, lockedUntil: null },
      data: { lockedUntil },
    });

    if (claim.count === 1) {
      return { justLocked: true, lockedUntil };
    }

    // Lost the race to a concurrent request that locked the account in
    // between our increment and this claim - re-read so the caller still
    // gets an accurate lockedUntil, but must not report justLocked twice.
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { justLocked: false, lockedUntil: current.lockedUntil };
  }

  /** Successful authentication resets the lockout state and stamps
   * lastLoginAt, per the approved security policy. */
  async registerSuccessfulLogin(
    userId: string,
    client: LoginAttemptWriteClient = this.prisma,
    loggedInAt = new Date(),
  ): Promise<void> {
    await client.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: loggedInAt },
    });
  }
}
