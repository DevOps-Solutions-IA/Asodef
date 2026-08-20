import { randomUUID, createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type User } from "@prisma/client";
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
import { AdminIdentityPolicy, PrivilegedRecoveryConfigurationError } from "./admin-identity.policy";

const GENERIC_FORGOT_PASSWORD_MESSAGE = "Si la cuenta existe, se enviarán instrucciones de recuperación de contraseña.";
const GENERIC_RESET_SUCCESS_MESSAGE = "Tu contraseña ha sido restablecida correctamente. Ya puedes iniciar sesión.";
const GENERIC_CHANGE_SUCCESS_MESSAGE = "Tu contraseña ha sido actualizada correctamente.";
const SAFE_RATE_LIMITED_MESSAGE = "Demasiados intentos. Intenta nuevamente más tarde.";
const FORGOT_PASSWORD_RESPONSE_FLOOR_MS = 250;

/**
 * Orchestrates forgot-password / reset-password / change-password
 * (US-007). Kept separate from AuthService (login/refresh/logout,
 * US-006) - a different domain with its own failure modes, deliberately
 * not folded into an already-large class.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

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
    private readonly adminIdentityPolicy: AdminIdentityPolicy,
  ) {}

  /**
   * Token creation and durable outbox insertion are awaited: an API process
   * exit after returning 200 can no longer lose the recovery command. The
   * public response remains generic and is held to a common minimum duration
   * for existing, unknown, ineligible and rate-limited identities. Delivery
   * itself remains the durable NotificationJob worker's responsibility.
   */
  async forgotPassword(dto: ForgotPasswordDto, context: RequestContext): Promise<ForgotPasswordResponse> {
    const responseNotBefore = Date.now() + FORGOT_PASSWORD_RESPONSE_FLOOR_MS;
    const email = dto.email.trim().toLowerCase();
    const rateLimited = await this.isForgotPasswordRateLimited(email, context);

    if (!rateLimited) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user && user.status === "ACTIVE") {
        await this.processForgotPassword(user, context).catch(() => {
          // Preserve the non-enumerating public response, but never make a
          // failed durable recovery command operationally invisible. Do not
          // include the exception, identity, address or request metadata: a
          // driver/transport error can contain connection details.
          this.logger.error("Password recovery command could not be persisted");
        });
      }
    }

    const remainingDelay = responseNotBefore - Date.now();
    if (remainingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }

    // Identical response whether the account exists, is ineligible, or
    // the request was silently rate-limited - see the class doc comment.
    return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
  }

  private async isForgotPasswordRateLimited(email: string, context: RequestContext): Promise<boolean> {
    const ipKey = `forgot-password:ip:${context.ipAddress ?? "unknown"}`;
    const identifierKey = `forgot-password:identifier:${sha256Hex(email)}`;
    const ipMax = this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IP_MAX", { infer: true });
    const ipWindow = this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IP_WINDOW_SECONDS", { infer: true });
    const identifierMax = this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_MAX", { infer: true });
    const identifierWindow = this.configService.get("FORGOT_PASSWORD_RATE_LIMIT_IDENTIFIER_WINDOW_SECONDS", { infer: true });

    if (!this.adminIdentityPolicy.isPrivilegedAdminEmail(email)) {
      const [ipLimit, identifierLimit] = await Promise.all([
        this.rateLimiterService.checkAndIncrement(ipKey, ipMax, ipWindow),
        this.rateLimiterService.checkAndIncrement(identifierKey, identifierMax, identifierWindow),
      ]);
      return ipLimit.limited || identifierLimit.limited;
    }

    try {
      // Recovery of the only privileged administrator has no database-backed
      // abuse counter to compensate for a Redis outage. It therefore uses the
      // strict variants and blocks issuance when either control is unavailable.
      // Strict counters report limited at `count >= threshold`; add one so the
      // existing forgot-password contract still permits exactly the configured
      // maximum and blocks the following request (`count > max`).
      const [ipLimit, identifierLimit] = await Promise.all([
        this.rateLimiterService.checkAndIncrementStrict(ipKey, ipMax + 1, ipWindow),
        this.rateLimiterService.checkAndIncrementStrict(identifierKey, identifierMax + 1, identifierWindow),
      ]);
      return ipLimit.limited || identifierLimit.limited;
    } catch {
      // Keep the same generic response and response floor. This log contains
      // neither email, IP, Redis key nor error details.
      this.logger.warn("Privileged recovery rate-limit unavailable - issuance blocked");
      return true;
    }
  }

  private async processForgotPassword(user: User, context: RequestContext): Promise<void> {
    // Generate the bearer value before opening the transaction. Only its
    // keyed hash is persisted; token supersession, new token, mandatory
    // audit evidence and encrypted outbox command then commit as one unit.
    // The stable User row is locked first: concurrent requests for the same
    // identity therefore serialize before either request can supersede or
    // insert a token. Without that lock, two READ COMMITTED transactions
    // could both observe no active token and each create one.
    const rawToken = this.passwordResetTokenService.generateToken();
    try {
      await this.prisma.$transaction(async (tx) => {
        const lockedUsers = await tx.$queryRaw<Array<{
          id: string;
          email: string;
          recoveryEmail: string | null;
          status: string;
        }>>(Prisma.sql`
          SELECT "id",
                 "email",
                 "recovery_email" AS "recoveryEmail",
                 "status"::text AS "status"
          FROM "users"
          WHERE "id" = ${user.id}::uuid
          FOR UPDATE
        `);
        const lockedUser = lockedUsers[0];
        if (lockedUsers.length !== 1 || !lockedUser || lockedUser.status !== "ACTIVE") {
          return;
        }

        // Resolve the delivery address from the locked, current database
        // row—not the pre-transaction lookup. This prevents an admin email
        // change racing recovery issuance from sending a bearer link to a
        // stale address, and rechecks the privileged recovery invariant at
        // the exact point of issuance.
        const recipientEmail = this.adminIdentityPolicy.resolvePasswordRecoveryRecipient(lockedUser);

        await this.securityEventService.recordRequired(tx, {
          type: "PASSWORD_RESET_REQUESTED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
        });

        const passwordReset = await this.passwordResetTokenService.createTokenFromRaw(user.id, context, rawToken, tx);

        await this.securityEventService.recordRequired(tx, {
          type: "PASSWORD_RESET_TOKEN_CREATED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: { passwordResetId: passwordReset.id },
        });

        await this.notificationService.queuePasswordResetEmailRequired(tx, {
          recipientEmail,
          userId: user.id,
          resetUrl: this.buildResetUrl(rawToken),
          correlationId: context.requestId ?? passwordReset.id,
        });
      });
    } catch (error) {
      if (!(error instanceof PrivilegedRecoveryConfigurationError)) throw error;
      await this.recordInvalidPrivilegedRecovery(user.id, context);
    }
  }

  private async recordInvalidPrivilegedRecovery(userId: string, context: RequestContext): Promise<void> {
    await this.securityEventService.record({
      type: "PASSWORD_RESET_FAILED",
      userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { reason: "PRIVILEGED_RECOVERY_CONFIGURATION_INVALID" },
    });

    // The alert uses the independently configured recovery-only address,
    // never the missing/mismatched database value. Failure to queue the
    // alert is swallowed here to avoid recursively invoking recovery or
    // changing the generic public forgot-password response.
    await this.notificationService.queueSecurityAlert({
      recipientEmail: this.adminIdentityPolicy.recoveryEmail,
      userId,
      correlationId: context.requestId ?? randomUUID(),
      subject: "Configuración de recuperación administrativa requiere atención",
      textBody: "La recuperación de la cuenta administrativa fue bloqueada porque su canal privilegiado no coincide con la configuración aprobada.",
    }).catch(() => undefined);
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

    const newHash = await this.passwordService.hash(dto.newPassword);
    const changedAt = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await this.passwordResetTokenService.claim(passwordReset, tx, changedAt);
        if (!claimed) throw this.tokenAlreadyUsed();

        const updated = await tx.user.updateMany({
          where: { id: user.id, status: "ACTIVE", passwordHash: user.passwordHash },
          data: { passwordHash: newHash, passwordChangedAt: changedAt, failedLoginAttempts: 0, lockedUntil: null },
        });
        if (updated.count !== 1) throw this.concurrentUpdate();

        await tx.passwordHistoryEntry.create({ data: { userId: user.id, passwordHash: user.passwordHash } });

        // A reset proves identity only via (possibly-compromised) email
        // access, so every session is revoked in the same atomic commit.
        await this.sessionService.revokeAllForUser(user.id, "PASSWORD_RESET", tx);
        await this.securityEventService.recordRequired(tx, {
          type: "PASSWORD_SESSIONS_REVOKED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: { reason: "PASSWORD_RESET" },
        });
        await this.securityEventService.recordRequired(tx, {
          type: "PASSWORD_RESET_SUCCEEDED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof PasswordRecoveryException && error.code === PasswordRecoveryErrorCode.TOKEN_ALREADY_USED) {
        await this.securityEventService.record({
          type: "PASSWORD_RESET_TOKEN_REUSED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: { passwordResetId: passwordReset.id, reason: "concurrent_claim_lost" },
        });
      }
      if (this.isSerializationConflict(error)) throw this.concurrentUpdate();
      throw error;
    }

    await this.queuePasswordChangedConfirmation(user, context, context.requestId ?? passwordReset.id);

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
    const changedAt = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({
          where: { id: user.id, status: "ACTIVE", passwordHash: user.passwordHash },
          data: { passwordHash: newHash, passwordChangedAt: changedAt },
        });
        if (updated.count !== 1) throw this.concurrentUpdate();

        await tx.passwordHistoryEntry.create({ data: { userId: user.id, passwordHash: user.passwordHash } });

        // The acting session retains its refresh token; all other sessions,
        // the password mutation and both mandatory events commit atomically.
        await this.sessionService.revokeAllForUserExcept(user.id, currentSessionId, "PASSWORD_CHANGED", tx);
        const assuranceCleared = await this.sessionService.clearAssuranceForUsableSession(
          currentSessionId,
          user.id,
          tx,
          changedAt,
        );
        if (!assuranceCleared) throw this.concurrentUpdate();
        await this.securityEventService.recordRequired(tx, {
          type: "PASSWORD_CHANGED",
          userId: user.id,
          sessionId: currentSessionId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
        });
        await this.securityEventService.recordRequired(tx, {
          type: "PASSWORD_SESSIONS_REVOKED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: { reason: "PASSWORD_CHANGED", currentSessionPreserved: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isSerializationConflict(error)) throw this.concurrentUpdate();
      throw error;
    }

    await this.queuePasswordChangedConfirmation(user, context, context.requestId ?? randomUUID());

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

  private async queuePasswordChangedConfirmation(
    user: Pick<User, "id" | "email">,
    context: RequestContext,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.notificationService.queuePasswordChangedEmail({
        recipientEmail: user.email,
        userId: user.id,
        correlationId,
      });
    } catch {
      await this.securityEventService.record({
        type: "PASSWORD_NOTIFICATION_FAILED",
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: "PASSWORD_CHANGED_NOTIFICATION_QUEUE_FAILED" },
      });
      await this.notificationService.queueSecurityAlert({
        recipientEmail: this.adminIdentityPolicy.recoveryEmail,
        userId: user.id,
        correlationId,
        subject: "Notificación de cambio de contraseña requiere atención",
        textBody: "La contraseña fue modificada, pero no fue posible encolar su confirmación. Revisa el canal de notificaciones.",
      }).catch(() => undefined);
    }
  }

  private tokenAlreadyUsed(): PasswordRecoveryException {
    return new PasswordRecoveryException(
      PasswordRecoveryErrorCode.TOKEN_ALREADY_USED,
      "Este enlace ya fue utilizado. Solicita uno nuevo.",
    );
  }

  private concurrentUpdate(): PasswordRecoveryException {
    return new PasswordRecoveryException(
      PasswordRecoveryErrorCode.CONCURRENT_UPDATE,
      "La cuenta cambió durante la operación. Intenta nuevamente.",
    );
  }

  private isSerializationConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
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
