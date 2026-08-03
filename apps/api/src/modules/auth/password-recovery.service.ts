import { randomUUID, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { User } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { NotificationService } from "../notifications/notification.service";
import { PasswordService } from "./password.service";
import { PasswordPolicyService, type PasswordShapeViolation } from "./password-policy/password-policy.service";
import { PasswordResetTokenService } from "./password-reset-token.service";
import { SessionService } from "./session.service";
import { RateLimiterService } from "./rate-limiter.service";
import type { RequestContext } from "./auth.service";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import {
  PasswordRecoveryErrorCode,
  PasswordRecoveryException,
  type ForgotPasswordResponse,
  type ResetPasswordResponse,
  type ChangePasswordResponse,
} from "./password-recovery.types";
import type { EnvConfig } from "../../config/env.validation";

const GENERIC_FORGOT_PASSWORD_MESSAGE = "Si la cuenta existe, se enviarán instrucciones de recuperación de contraseña.";
const GENERIC_RESET_SUCCESS_MESSAGE = "Tu contraseña ha sido restablecida correctamente. Ya puedes iniciar sesión.";
const GENERIC_CHANGE_SUCCESS_MESSAGE = "Tu contraseña ha sido actualizada correctamente.";
const SAFE_RATE_LIMITED_MESSAGE = "Demasiados intentos. Intenta nuevamente más tarde.";

/**
 * Orchestrates forgot-password / reset-password / change-password
 * (US-007). Kept separate from AuthService (login/refresh/logout,
 * US-006) - a different domain with its own failure modes, deliberately
 * not folded into an already-large class.
 */
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly passwordResetTokenService: PasswordResetTokenService,
    private readonly sessionService: SessionService,
    private readonly securityEventService: SecurityEventService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * The synchronous (awaited) part of this method does only two things
   * regardless of whether the account exists: check rate limits, and run
   * one indexed `findUnique`. Everything with variable cost - creating a
   * token, writing a NotificationJob, attempting delivery - happens in
   * `processForgotPassword`, fired without awaiting it. That is what
   * makes response timing identical for an existing vs. unknown account:
   * the expensive work happens strictly *after* the response has already
   * been decided, not because it is disguised with dummy work.
   */
  async forgotPassword(dto: ForgotPasswordDto, context: RequestContext): Promise<ForgotPasswordResponse> {
    const email = dto.email.trim().toLowerCase();

    const ipLimit = await this.rateLimiterService.checkAndIncrement(
      `forgot-password:ip:${context.ipAddress ?? "unknown"}`,
      this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IP_MAX", { infer: true }),
      this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IP_WINDOW_SECONDS", { infer: true }),
    );
    const identifierLimit = await this.rateLimiterService.checkAndIncrement(
      `forgot-password:identifier:${sha256Hex(email)}`,
      this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_MAX", { infer: true }),
      this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_WINDOW_SECONDS", { infer: true }),
    );

    if (!ipLimit.limited && !identifierLimit.limited) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user && user.status === "ACTIVE") {
        void this.processForgotPassword(user, context).catch(() => undefined);
      }
    }

    // Identical response whether the account exists, is ineligible, or
    // the request was silently rate-limited - see the class doc comment.
    return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
  }

  private async processForgotPassword(user: User, context: RequestContext): Promise<void> {
    await this.securityEventService.record({
      type: "PASSWORD_RESET_REQUESTED",
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    const { passwordReset, rawToken } = await this.passwordResetTokenService.createToken(user.id, context);

    await this.securityEventService.record({
      type: "PASSWORD_RESET_TOKEN_CREATED",
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { passwordResetId: passwordReset.id },
    });

    await this.notificationService.queuePasswordResetEmail({
      recipientEmail: user.email,
      userId: user.id,
      resetUrl: this.buildResetUrl(rawToken),
      correlationId: context.requestId ?? passwordReset.id,
    });
  }

  private buildResetUrl(rawToken: string): string {
    const base = this.configService.get("PUBLIC_APP_URL", { infer: true });
    return `${base}/restablecer-clave?token=${encodeURIComponent(rawToken)}`;
  }

  async resetPassword(dto: ResetPasswordDto, context: RequestContext): Promise<ResetPasswordResponse> {
    const ipLimit = await this.rateLimiterService.checkAndIncrement(
      `reset-password:ip:${context.ipAddress ?? "unknown"}`,
      this.configService.get("RESET_PASSWORD_RATE_LIMIT_MAX", { infer: true }),
      this.configService.get("RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS", { infer: true }),
    );
    if (ipLimit.limited) {
      throw new PasswordRecoveryException(PasswordRecoveryErrorCode.RATE_LIMITED, SAFE_RATE_LIMITED_MESSAGE);
    }

    const passwordReset = await this.passwordResetTokenService.findByRawToken(dto.token);
    if (!passwordReset || passwordReset.supersededAt) {
      throw this.invalidOrExpired();
    }
    if (passwordReset.usedAt) {
      await this.securityEventService.record({
        type: "PASSWORD_RESET_TOKEN_REUSED",
        userId: passwordReset.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { passwordResetId: passwordReset.id },
      });
      throw new PasswordRecoveryException(
        PasswordRecoveryErrorCode.TOKEN_ALREADY_USED,
        "Este enlace ya fue utilizado. Solicita uno nuevo.",
      );
    }
    if (passwordReset.expiresAt.getTime() <= Date.now()) {
      await this.securityEventService.record({
        type: "PASSWORD_RESET_TOKEN_EXPIRED",
        userId: passwordReset.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { passwordResetId: passwordReset.id },
      });
      throw this.invalidOrExpired();
    }

    const passwordResetUserId = passwordReset.userId;
    if (!passwordResetUserId) {
      throw this.invalidOrExpired();
    }
    const user = await this.prisma.user.findUnique({ where: { id: passwordResetUserId } });
    if (!user || user.status !== "ACTIVE") {
      throw this.invalidOrExpired();
    }

    const shapeViolations = this.passwordPolicyService.validateShape(dto.newPassword, { email: user.email });
    if (shapeViolations.length > 0) {
      await this.recordFailure("PASSWORD_RESET_FAILED", user.id, context, "WEAK_PASSWORD");
      throw new PasswordRecoveryException(PasswordRecoveryErrorCode.WEAK_PASSWORD, this.weakPasswordMessage(shapeViolations));
    }

    const historyHashes = await this.recentPasswordHashes(user.id);
    if (await this.passwordPolicyService.isReused(dto.newPassword, user.passwordHash, historyHashes)) {
      await this.recordFailure("PASSWORD_RESET_FAILED", user.id, context, "PASSWORD_REUSED");
      throw new PasswordRecoveryException(
        PasswordRecoveryErrorCode.PASSWORD_REUSED,
        "No puedes reutilizar una contraseña reciente.",
      );
    }

    const claimed = await this.passwordResetTokenService.claim(passwordReset);
    if (!claimed) {
      // Lost a race with a concurrent request already consuming this
      // exact token - a genuine, if rare, single-use violation attempt.
      await this.securityEventService.record({
        type: "PASSWORD_RESET_TOKEN_REUSED",
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { passwordResetId: passwordReset.id, reason: "concurrent_claim_lost" },
      });
      throw new PasswordRecoveryException(
        PasswordRecoveryErrorCode.TOKEN_ALREADY_USED,
        "Este enlace ya fue utilizado. Solicita uno nuevo.",
      );
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordHistoryEntry.create({ data: { userId: user.id, passwordHash: user.passwordHash } });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    // A reset proves identity only via (possibly-compromised) email
    // access, not an active session, so - unlike change-password - every
    // session including the one that just requested this is revoked.
    await this.sessionService.revokeAllForUser(user.id, "PASSWORD_RESET");
    await this.securityEventService.record({
      type: "PASSWORD_SESSIONS_REVOKED",
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { reason: "PASSWORD_RESET" },
    });
    await this.securityEventService.record({
      type: "PASSWORD_RESET_SUCCEEDED",
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    await this.notificationService.queuePasswordChangedEmail({
      recipientEmail: user.email,
      userId: user.id,
      correlationId: context.requestId ?? passwordReset.id,
    });

    // Deliberately does NOT log the user in / issue tokens - see US-007
    // section 2 ("never automatically log the user in after reset unless
    // the approved product policy explicitly requires it"). The user
    // must authenticate fresh with their new password.
    return { message: GENERIC_RESET_SUCCESS_MESSAGE };
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
    context: RequestContext,
  ): Promise<ChangePasswordResponse> {
    const rateLimitKey = `change-password:user:${userId}`;
    const max = this.configService.get("CHANGE_PASSWORD_RATE_LIMIT_MAX", { infer: true });
    const windowSeconds = this.configService.get("CHANGE_PASSWORD_RATE_LIMIT_WINDOW_SECONDS", { infer: true });

    // Only *failures* count against this limit (peek, don't increment,
    // before verifying) - a correct current password must never move the
    // counter, per US-007 section 10.
    const peek = await this.rateLimiterService.peek(rateLimitKey, max);
    if (peek.limited) {
      throw new PasswordRecoveryException(PasswordRecoveryErrorCode.RATE_LIMITED, SAFE_RATE_LIMITED_MESSAGE);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const currentPasswordValid = await this.passwordService.verify(user.passwordHash, dto.currentPassword);
    if (!currentPasswordValid) {
      await this.rateLimiterService.checkAndIncrement(rateLimitKey, max, windowSeconds);
      await this.recordFailure("PASSWORD_CHANGE_FAILED", user.id, context, "CURRENT_PASSWORD_INVALID");
      // Never a raw Argon2/crypto error - PasswordService.verify() already
      // guarantees this resolves to a plain boolean, never a thrown
      // exception, so there is nothing lower-level to leak here.
      throw new PasswordRecoveryException(
        PasswordRecoveryErrorCode.CURRENT_PASSWORD_INVALID,
        "La contraseña actual no es válida.",
      );
    }

    const shapeViolations = this.passwordPolicyService.validateShape(dto.newPassword, { email: user.email });
    if (shapeViolations.length > 0) {
      await this.recordFailure("PASSWORD_CHANGE_FAILED", user.id, context, "WEAK_PASSWORD");
      throw new PasswordRecoveryException(PasswordRecoveryErrorCode.WEAK_PASSWORD, this.weakPasswordMessage(shapeViolations));
    }

    const historyHashes = await this.recentPasswordHashes(user.id);
    if (await this.passwordPolicyService.isReused(dto.newPassword, user.passwordHash, historyHashes)) {
      await this.recordFailure("PASSWORD_CHANGE_FAILED", user.id, context, "PASSWORD_REUSED");
      throw new PasswordRecoveryException(
        PasswordRecoveryErrorCode.PASSWORD_REUSED,
        "No puedes reutilizar una contraseña reciente.",
      );
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordHistoryEntry.create({ data: { userId: user.id, passwordHash: user.passwordHash } });
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: newHash, passwordChangedAt: new Date() } });
    });

    // Documented decision (US-007 section 3): the session performing
    // this change keeps its refresh token (the user already proved both
    // the old and new password within it) while every *other* session's
    // refresh token is revoked. This does NOT exempt the current access
    // token from JwtAuthGuard's universal passwordChangedAt check below -
    // every already-issued access token, including this session's, is
    // invalidated the instant passwordChangedAt is stamped. The acting
    // device transparently mints a new one via /refresh; it is never
    // forced through a full re-login the way other devices effectively
    // are once their own already-issued access tokens expire. See
    // SessionService.revokeAllForUserExcept and the dedicated tests
    // covering both halves of this behavior.
    await this.sessionService.revokeAllForUserExcept(user.id, currentSessionId, "PASSWORD_CHANGED");

    await this.securityEventService.record({
      type: "PASSWORD_CHANGED",
      userId: user.id,
      sessionId: currentSessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
    await this.securityEventService.record({
      type: "PASSWORD_SESSIONS_REVOKED",
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { reason: "PASSWORD_CHANGED", currentSessionPreserved: true },
    });

    await this.notificationService.queuePasswordChangedEmail({
      recipientEmail: user.email,
      userId: user.id,
      correlationId: context.requestId ?? randomUUID(),
    });

    return { message: GENERIC_CHANGE_SUCCESS_MESSAGE };
  }

  /** The current hash plus the most recent (historyLimit - 1) historical
   * hashes = historyLimit total passwords considered for reuse. */
  private async recentPasswordHashes(userId: string): Promise<string[]> {
    const rows = await this.prisma.passwordHistoryEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.max(0, this.passwordPolicyService.historyLimit - 1),
    });
    return rows.map((row) => row.passwordHash);
  }

  private async recordFailure(
    type: "PASSWORD_RESET_FAILED" | "PASSWORD_CHANGE_FAILED",
    userId: string,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    await this.securityEventService.record({
      type,
      userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { reason },
    });
  }

  private invalidOrExpired(): PasswordRecoveryException {
    return new PasswordRecoveryException(
      PasswordRecoveryErrorCode.INVALID_OR_EXPIRED_TOKEN,
      "Token de restablecimiento inválido o expirado.",
    );
  }

  private weakPasswordMessage(violations: PasswordShapeViolation[]): string {
    if (violations.includes("TOO_SHORT")) {
      return `La contraseña debe tener al menos ${this.passwordPolicyService.minLength} caracteres.`;
    }
    if (violations.includes("TOO_LONG")) {
      return `La contraseña no puede tener más de ${this.passwordPolicyService.maxLength} caracteres.`;
    }
    if (violations.includes("COMMON_PASSWORD")) {
      return "Esta contraseña es demasiado común. Elige una diferente.";
    }
    if (violations.includes("CONTAINS_EMAIL")) {
      return "La contraseña no puede ser igual o derivarse de tu correo electrónico.";
    }
    return "La contraseña no cumple con la política de seguridad.";
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
