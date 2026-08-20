import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Secret, TOTP } from "otpauth";
import { Prisma, type User } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { SecurityEventService } from "../../../common/security-events/security-event.service";
import type { EnvConfig } from "../../../config/env.validation";
import { AdminIdentityPolicy } from "../admin-identity.policy";
import { PasswordService } from "../password.service";
import { RateLimiterService, RateLimitDependencyUnavailableError } from "../rate-limiter.service";
import type { RequestContext } from "../auth.service";
import { MfaSecretProtectorService } from "./mfa-secret-protector.service";
import { MfaException, type MfaStatus } from "./mfa.types";

const TOTP_ALGORITHM = "SHA1";
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW = 1;
const CHALLENGE_MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

export interface MfaEnrollmentStart {
  secret: string;
  otpauthUri: string;
  expiresAt: Date;
}

export interface MfaLoginChallengeResult {
  challengeToken: string;
  expiresAt: Date;
}

type PreparedStepUpFactor =
  | { kind: "totp"; counter: number }
  | { kind: "recovery"; recoveryCodeId: string };

export type CompletedMfaLoginWriter<T> = (
  tx: Prisma.TransactionClient,
  user: User,
  verifiedAt: Date,
) => Promise<T>;

@Injectable()
export class AdminMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly adminIdentityPolicy: AdminIdentityPolicy,
    private readonly passwordService: PasswordService,
    private readonly rateLimiter: RateLimiterService,
    private readonly protector: MfaSecretProtectorService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  isEnforcementRequiredFor(email: string): boolean {
    return this.config.get("ADMIN_MFA_REQUIRED", { infer: true }) && this.adminIdentityPolicy.isPrivilegedAdminEmail(email);
  }

  async getStatus(userId: string): Promise<MfaStatus> {
    await this.requirePrivilegedUser(userId);
    const credential = await this.prisma.adminMfaCredential.findUnique({ where: { userId } });
    const recoveryCodesRemaining = credential?.status === "ACTIVE"
      ? await this.prisma.adminMfaRecoveryCode.count({ where: { credentialId: credential.id, usedAt: null } })
      : 0;
    return {
      required: this.config.get("ADMIN_MFA_REQUIRED", { infer: true }),
      enrolled: credential?.status === "ACTIVE",
      status: credential?.status ?? "NOT_ENROLLED",
      confirmedAt: credential?.confirmedAt ?? null,
      recoveryCodesRemaining,
    };
  }

  async beginEnrollment(
    userId: string,
    sessionId: string,
    password: string,
    context: RequestContext,
  ): Promise<MfaEnrollmentStart> {
    const user = await this.requirePrivilegedUser(userId);
    const enrollmentKeys = this.enrollmentRateLimitKeys("begin", user.id, sessionId, context);
    await this.requireEnrollmentPassword(
      user,
      sessionId,
      password,
      context,
      enrollmentKeys,
      this.config.get("ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS", { infer: true }),
    );
    // Fast-path only. The same invariant is checked again from a locked row
    // inside the transaction below and this value is never used to write.
    const existing = await this.prisma.adminMfaCredential.findUnique({ where: { userId } });
    if (existing?.status === "ACTIVE") {
      throw new MfaException("MFA_ALREADY_ENABLED", "MFA ya está habilitado.");
    }
    const secret = new Secret({ size: 20 });
    const secretBase32 = secret.base32;
    const expiresAt = new Date(Date.now() + this.config.get("ADMIN_MFA_ENROLLMENT_TTL_SECONDS", { infer: true }) * 1000);
    const encrypted = this.protector.encrypt(secretBase32);

    await this.prisma.$transaction(async (tx) => {
      await this.assertCurrentEnrollmentPrincipal(tx, user, sessionId, new Date());
      // Serialize enrollment replacement with confirmation/revocation. The
      // status must be decided from the locked row, never from a pre-transaction
      // read: otherwise a concurrent confirmation could activate the current
      // generation and this upsert could degrade it back to PENDING (ABA).
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "admin_mfa_credentials"
        WHERE "user_id" = ${user.id}::uuid
        FOR UPDATE
      `);
      const currentCredential = await tx.adminMfaCredential.findUnique({ where: { userId: user.id } });
      if (currentCredential?.status === "ACTIVE") {
        throw new MfaException("MFA_ALREADY_ENABLED", "MFA ya está habilitado.");
      }
      const credential = await tx.adminMfaCredential.upsert({
        where: { userId },
        create: { userId, secretEncrypted: encrypted, pendingExpiresAt: expiresAt },
        update: {
          status: "PENDING",
          secretEncrypted: encrypted,
          pendingExpiresAt: expiresAt,
          confirmedAt: null,
          revokedAt: null,
          lastUsedCounter: null,
        },
      });
      await tx.adminMfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
      await this.securityEvents.recordRequired(tx, {
        type: "MFA_ENROLLMENT_STARTED",
        userId: user.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
      });
    });
    return {
      secret: secretBase32,
      otpauthUri: this.totp(secretBase32, user.email).toString(),
      expiresAt,
    };
  }

  async confirmEnrollment(
    userId: string,
    sessionId: string,
    password: string,
    code: string,
    context: RequestContext,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.requirePrivilegedUser(userId);
    const credential = await this.prisma.adminMfaCredential.findUnique({ where: { userId } });
    if (!credential || credential.status !== "PENDING") {
      throw new MfaException("MFA_NOT_AVAILABLE", "No existe una inscripción MFA pendiente.");
    }
    if (!credential.pendingExpiresAt || credential.pendingExpiresAt.getTime() <= Date.now()) {
      throw new MfaException("MFA_ENROLLMENT_EXPIRED", "La inscripción MFA expiró. Iníciala nuevamente.");
    }

    // A new pending secret creates a new bounded confirmation generation.
    // Hashing the encrypted value keeps the Redis key free of secret material
    // while preventing a previous failed generation from poisoning a newly
    // started enrollment. Its TTL never exceeds the pending enrollment TTL,
    // so confirmation attempts cannot reset until that credential expires.
    const generation = sha256(credential.secretEncrypted);
    const enrollmentKeys = this.enrollmentRateLimitKeys(`confirm:${generation}`, user.id, sessionId, context);
    const remainingEnrollmentSeconds = Math.max(
      1,
      Math.ceil((credential.pendingExpiresAt.getTime() - Date.now()) / 1000),
    );
    await this.requireEnrollmentPassword(
      user,
      sessionId,
      password,
      context,
      enrollmentKeys,
      remainingEnrollmentSeconds,
    );

    const secret = this.protector.decrypt(credential.secretEncrypted);
    const confirmationTimestamp = Date.now();
    const confirmationDelta = this.validateTotp(secret, code, confirmationTimestamp);
    if (confirmationDelta === null) {
      await this.recordEnrollmentFailure(
        enrollmentKeys,
        remainingEnrollmentSeconds,
        user.id,
        context,
        "ENROLLMENT_CODE_INVALID",
      );
      throw new MfaException("MFA_INVALID_CODE", "Código de verificación inválido.");
    }

    const rawCodes = this.generateRecoveryCodes();
    const hashes = await Promise.all(rawCodes.map((rawCode) => this.passwordService.hash(rawCode)));
    const activatedAt = new Date();
    const confirmationCounter = Math.floor(confirmationTimestamp / 1000 / TOTP_PERIOD_SECONDS) + confirmationDelta;
    await this.prisma.$transaction(async (tx) => {
      await this.assertCurrentEnrollmentPrincipal(tx, user, sessionId, activatedAt);
      const activated = await tx.adminMfaCredential.updateMany({
        where: {
          id: credential.id,
          status: "PENDING",
          secretEncrypted: credential.secretEncrypted,
          pendingExpiresAt: { equals: credential.pendingExpiresAt, gt: activatedAt },
        },
        data: {
          status: "ACTIVE",
          confirmedAt: activatedAt,
          pendingExpiresAt: null,
          revokedAt: null,
          // Enrollment itself consumes this time step. The same code shown
          // during confirmation can never be replayed immediately at login.
          lastUsedCounter: confirmationCounter,
        },
      });
      if (activated.count !== 1) throw new MfaException("MFA_CONFLICT", "La inscripción MFA cambió concurrentemente.");
      await tx.adminMfaRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({ credentialId: credential.id, codeHash })),
      });
      await tx.adminMfaLoginChallenge.deleteMany({ where: { userId: user.id, usedAt: null } });
      await this.securityEvents.recordRequired(tx, {
        type: "MFA_ENABLED",
        userId: user.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
      });
    });
    return { recoveryCodes: rawCodes };
  }

  async createLoginChallenge(user: User, context: RequestContext): Promise<MfaLoginChallengeResult> {
    const currentUser = await this.requirePrivilegedUser(user.id);
    // The password was verified against `user` immediately before this call.
    // A concurrent reset/change must invalidate that first-factor result
    // instead of allowing a challenge based on an obsolete password hash.
    if (currentUser.passwordHash !== user.passwordHash ||
        currentUser.passwordChangedAt?.getTime() !== user.passwordChangedAt?.getTime()) {
      throw this.invalidChallenge();
    }
    // A correct password may issue more than one challenge. Limit the MFA
    // ceremony across all of them with a stable account key plus a hashed IP
    // key; otherwise five attempts per challenge would be multiplicative.
    await this.assertMfaLoginRateLimit(this.mfaLoginRateLimitKeys(currentUser.id, context));
    const credential = await this.prisma.adminMfaCredential.findUnique({ where: { userId: currentUser.id } });
    if (!credential || credential.status !== "ACTIVE") {
      await this.record("MFA_FAILED", currentUser.id, context, { reason: "ENROLLMENT_REQUIRED" });
      throw new MfaException("MFA_ENROLLMENT_REQUIRED", "La autenticación multifactor debe estar configurada.");
    }

    // Bind the challenge to this exact credential generation without
    // persisting secret material in the challenge row. Revoke/re-enroll can
    // never make a previously issued ceremony valid against a new factor.
    const generation = sha256(credential.secretEncrypted);
    const rawToken = `${randomBytes(32).toString("base64url")}.${generation}`;
    const expiresAt = new Date(Date.now() + this.config.get("ADMIN_MFA_CHALLENGE_TTL_SECONDS", { infer: true }) * 1000);
    await this.prisma.adminMfaLoginChallenge.create({
      data: {
        userId: currentUser.id,
        tokenHash: sha256(rawToken),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        expiresAt,
      },
    });
    await this.record("MFA_CHALLENGE_ISSUED", currentUser.id, context);
    return { challengeToken: rawToken, expiresAt };
  }

  /**
   * Consumes the login challenge/factor and invokes the authenticated-login
   * writer inside one PostgreSQL transaction. The callback is intentionally
   * mandatory: a valid one-time factor can never be consumed without the
   * Session/LoginAttempt/lastLogin/security-event state it authorizes.
   */
  async completeLoginChallenge<T>(
    rawToken: string,
    code: string,
    context: RequestContext,
    writeAuthenticatedLogin: CompletedMfaLoginWriter<T>,
  ): Promise<T> {
    const now = new Date();
    const ipRateLimitKey = this.mfaLoginIpRateLimitKey(context);
    // Unknown/replayed challenge tokens cannot name an account safely, but
    // their source still passes the strict IP gate before any lookup.
    await this.assertMfaLoginRateLimit([ipRateLimitKey]);
    const challenge = await this.prisma.adminMfaLoginChallenge.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!challenge) {
      await this.incrementMfaLoginFailures([ipRateLimitKey]);
      throw this.invalidChallenge();
    }
    const aggregateRateLimitKeys = this.mfaLoginRateLimitKeys(challenge.userId, context);
    await this.assertMfaLoginRateLimit(aggregateRateLimitKeys);
    if (challenge.usedAt) throw new MfaException("MFA_CHALLENGE_USED", "El desafío MFA ya fue utilizado.");
    if (challenge.expiresAt.getTime() <= now.getTime()) throw new MfaException("MFA_CHALLENGE_EXPIRED", "El desafío MFA expiró.");
    if (challenge.attemptCount >= CHALLENGE_MAX_ATTEMPTS) {
      throw new MfaException("MFA_ATTEMPTS_EXCEEDED", "El desafío MFA agotó sus intentos.");
    }

    // Password success is only a pre-authentication fact. Re-read the user
    // after the challenge delay and fail closed if account state, identity
    // policy, or password generation changed before MFA completion.
    const user = await this.prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || user.status !== "ACTIVE" ||
        !this.adminIdentityPolicy.isPrivilegedAdminEmail(user.email) ||
        !this.adminIdentityPolicy.mayAuthenticate(user.email) ||
        (user.passwordChangedAt !== null && challenge.createdAt.getTime() < user.passwordChangedAt.getTime())) {
      throw this.invalidChallenge();
    }

    const credential = await this.prisma.adminMfaCredential.findUnique({ where: { userId: challenge.userId } });
    if (!credential || credential.status !== "ACTIVE") throw this.invalidChallenge();
    const challengeGeneration = rawToken.split(".")[1];
    if (!challengeGeneration || challengeGeneration !== sha256(credential.secretEncrypted)) {
      throw this.invalidChallenge();
    }
    const factor = await this.prepareStepUpFactor(
      credential.id,
      credential.secretEncrypted,
      credential.lastUsedCounter,
      code,
      now,
    );
    if (!factor) {
      await this.incrementMfaLoginFailures(aggregateRateLimitKeys);
      const attempt = await this.prisma.adminMfaLoginChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: now }, attemptCount: { lt: CHALLENGE_MAX_ATTEMPTS } },
        data: { attemptCount: { increment: 1 } },
      });
      if (attempt.count !== 1) throw this.invalidChallenge();
      await this.record("MFA_FAILED", challenge.userId, context, { reason: "LOGIN_CODE_INVALID" });
      throw new MfaException("MFA_INVALID_CODE", "Código de verificación inválido.");
    }

    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.adminMfaLoginChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: now }, attemptCount: { lt: CHALLENGE_MAX_ATTEMPTS } },
        data: { attemptCount: { increment: 1 } },
      });
      if (attempt.count !== 1) throw this.invalidChallenge();

      const currentUser = await tx.user.findUnique({ where: { id: challenge.userId } });
      if (!currentUser || currentUser.status !== "ACTIVE" ||
          !this.adminIdentityPolicy.isPrivilegedAdminEmail(currentUser.email) ||
          !this.adminIdentityPolicy.mayAuthenticate(currentUser.email) ||
          currentUser.passwordHash !== user.passwordHash ||
          (currentUser.passwordChangedAt !== null && challenge.createdAt.getTime() < currentUser.passwordChangedAt.getTime())) {
        throw this.invalidChallenge();
      }

      const currentCredential = await tx.adminMfaCredential.findUnique({ where: { id: credential.id } });
      if (!currentCredential || currentCredential.userId !== currentUser.id || currentCredential.status !== "ACTIVE") {
        throw this.invalidChallenge();
      }
      await this.consumePreparedStepUpFactor(tx, currentCredential.id, factor, now);

      const claimed = await tx.adminMfaLoginChallenge.updateMany({
        where: { id: challenge.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new MfaException("MFA_CHALLENGE_USED", "El desafío MFA ya fue utilizado.");
      }

      await this.securityEvents.recordRequired(tx, {
        type: factor.kind === "recovery" ? "MFA_RECOVERY_CODE_USED" : "MFA_VERIFIED",
        userId: currentUser.id,
        actorUserId: currentUser.id,
        subjectUserId: currentUser.id,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
        metadata: { purpose: "LOGIN" },
      });
      return writeAuthenticatedLogin(tx, currentUser, now);
    });
  }

  /** Re-authenticates the already authenticated privileged administrator
   * without minting credentials. Factor consumption, session assurance,
   * and the durable success event commit atomically, so a revoked session
   * can never consume a code or gain a partial step-up state. */
  async verifyStepUp(
    userId: string,
    sessionId: string,
    password: string,
    code: string,
    context: RequestContext,
  ): Promise<{ verifiedAt: Date }> {
    const user = await this.requirePrivilegedUser(userId);
    if (user.status !== "ACTIVE") throw new MfaException("MFA_ADMIN_ONLY", "Operación no disponible.");
    const maxAttempts = this.config.get("ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS", { infer: true });
    const windowSeconds = this.config.get("ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS", { infer: true });
    const keys = [
      `admin-step-up:session:${userId}:${sessionId}`,
      `admin-step-up:ip:${sha256(context.ipAddress ?? "unknown")}`,
    ];
    try {
      const states = await Promise.all(keys.map((key) => this.rateLimiter.peekStrict(key, maxAttempts)));
      if (states.some((state) => state.limited)) {
        throw new MfaException("MFA_ATTEMPTS_EXCEEDED", "Se agotaron los intentos de autenticación reciente.");
      }
    } catch (error) {
      if (error instanceof MfaException) throw error;
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new MfaException("MFA_NOT_AVAILABLE", "La autenticación reciente no está disponible temporalmente.");
      }
      throw error;
    }

    if (!(await this.passwordService.verify(user.passwordHash, password))) {
      await this.recordStepUpFailure(keys, maxAttempts, windowSeconds, user.id, context, "STEP_UP_PASSWORD_INVALID");
      throw new MfaException("MFA_PASSWORD_INVALID", "La contraseña actual no es válida.");
    }
    const credential = await this.requireActiveCredential(user.id);
    const verifiedAt = new Date();
    const factor = await this.prepareStepUpFactor(
      credential.id,
      credential.secretEncrypted,
      credential.lastUsedCounter,
      code,
      verifiedAt,
    );
    if (!factor) {
      await this.recordStepUpFailure(keys, maxAttempts, windowSeconds, user.id, context, "STEP_UP_FACTOR_INVALID");
      throw new MfaException("MFA_INVALID_CODE", "Código de verificación inválido.");
    }

    await this.prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!currentUser || currentUser.status !== "ACTIVE" ||
          currentUser.passwordHash !== user.passwordHash ||
          !this.adminIdentityPolicy.isPrivilegedAdminEmail(currentUser.email)) {
        throw new MfaException("MFA_PASSWORD_INVALID", "La autenticación reciente no pudo validarse.");
      }

      const currentCredential = await tx.adminMfaCredential.findUnique({ where: { id: credential.id } });
      if (!currentCredential || currentCredential.userId !== user.id || currentCredential.status !== "ACTIVE") {
        throw new MfaException("MFA_NOT_AVAILABLE", "MFA no está habilitado.");
      }

      await this.consumePreparedStepUpFactor(tx, currentCredential.id, factor, verifiedAt);
      const marked = await tx.session.updateMany({
        where: {
          id: sessionId,
          userId: user.id,
          revokedAt: null,
          rotatedAt: null,
          expiresAt: { gt: verifiedAt },
        },
        data: { mfaVerifiedAt: verifiedAt, recentAuthenticationAt: verifiedAt },
      });
      if (marked.count !== 1) {
        throw new MfaException("MFA_CONFLICT", "La sesión ya no está disponible.");
      }

      await this.securityEvents.recordRequired(tx, {
        type: factor.kind === "recovery" ? "MFA_RECOVERY_CODE_USED" : "MFA_VERIFIED",
        userId: user.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        sessionId,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
        metadata: { purpose: "STEP_UP" },
      });
    });

    return { verifiedAt };
  }

  private async recordStepUpFailure(
    keys: string[],
    maxAttempts: number,
    windowSeconds: number,
    userId: string,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    try {
      await Promise.all(keys.map((key) => this.rateLimiter.checkAndIncrementStrict(key, maxAttempts, windowSeconds)));
    } catch {
      // Verification already failed. The dependency outage is recorded by
      // the safe event below and the next attempt will fail closed at peek.
    }
    await this.record("MFA_FAILED", userId, context, { reason });
  }

  /** The HTTP boundary requires a recent completed step-up. This action
   * deliberately does not consume another factor: requiring the same TOTP
   * twice would make the guarded flow impossible because factors are
   * one-time/replay-protected. */
  async regenerateRecoveryCodes(userId: string, context: RequestContext): Promise<{ recoveryCodes: string[] }> {
    const user = await this.requirePrivilegedUser(userId);
    const credential = await this.requireActiveCredential(user.id);

    const rawCodes = this.generateRecoveryCodes();
    const hashes = await Promise.all(rawCodes.map((rawCode) => this.passwordService.hash(rawCode)));
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "admin_mfa_credentials"
        WHERE "id" = ${credential.id}::uuid
        FOR UPDATE
      `);
      const currentCredential = await tx.adminMfaCredential.findUnique({ where: { id: credential.id } });
      if (!currentCredential || currentCredential.userId !== user.id || currentCredential.status !== "ACTIVE") {
        throw new MfaException("MFA_CONFLICT", "La credencial MFA cambió concurrentemente.");
      }
      await tx.adminMfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
      await tx.adminMfaRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ credentialId: credential.id, codeHash })) });
      await tx.adminMfaLoginChallenge.deleteMany({ where: { userId: user.id, usedAt: null } });
      await this.securityEvents.recordRequired(tx, {
        type: "MFA_RECOVERY_CODES_REGENERATED",
        userId: user.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
      });
    });
    return { recoveryCodes: rawCodes };
  }

  /** See regenerateRecoveryCodes(): assurance is established once by
   * /auth/step-up and enforced by StepUpGuard at this mutation boundary. */
  async revoke(userId: string, context: RequestContext): Promise<void> {
    const user = await this.requirePrivilegedUser(userId);
    const credential = await this.requireActiveCredential(user.id);
    try {
      this.adminIdentityPolicy.resolvePasswordRecoveryRecipient(user);
    } catch {
      throw new MfaException("MFA_CONFLICT", "No existe un canal de recuperación administrativa válido.");
    }
    if (this.config.get("ADMIN_MFA_REQUIRED", { infer: true })) {
      throw new MfaException("MFA_CONFLICT", "Desactiva primero la obligatoriedad MFA mediante el cambio operativo controlado.");
    }

    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.adminMfaCredential.updateMany({
        where: { id: credential.id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt },
      });
      if (revoked.count !== 1) throw new MfaException("MFA_CONFLICT", "La credencial MFA cambió concurrentemente.");
      await tx.adminMfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
      await tx.adminMfaLoginChallenge.deleteMany({ where: { userId: user.id, usedAt: null } });
      // Assurance derived from this credential cannot outlive its
      // revocation. Clear every session atomically with the credential so a
      // stale mfaVerifiedAt cannot combine with a later password-only action.
      await tx.session.updateMany({
        where: { userId: user.id },
        data: { mfaVerifiedAt: null, recentAuthenticationAt: null },
      });
      await this.securityEvents.recordRequired(tx, {
        type: "MFA_REVOKED",
        userId: user.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
      });
    });
  }

  private async prepareStepUpFactor(
    credentialId: string,
    encryptedSecret: string,
    lastUsedCounter: number | null,
    code: string,
    now: Date,
  ): Promise<PreparedStepUpFactor | null> {
    if (/^\d{6}$/.test(code)) {
      const secret = this.protector.decrypt(encryptedSecret);
      const delta = this.validateTotp(secret, code, now.getTime());
      if (delta === null) return null;
      const counter = Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS) + delta;
      return lastUsedCounter === null || counter > lastUsedCounter ? { kind: "totp", counter } : null;
    }

    const normalized = code.trim().toUpperCase();
    const candidates = await this.prisma.adminMfaRecoveryCode.findMany({
      where: { credentialId, usedAt: null },
      select: { id: true, codeHash: true },
      take: RECOVERY_CODE_COUNT,
    });
    for (const candidate of candidates) {
      if (await this.passwordService.verify(candidate.codeHash, normalized)) {
        return { kind: "recovery", recoveryCodeId: candidate.id };
      }
    }
    return null;
  }

  private async consumePreparedStepUpFactor(
    tx: Prisma.TransactionClient,
    credentialId: string,
    factor: PreparedStepUpFactor,
    usedAt: Date,
  ): Promise<void> {
    const consumed = factor.kind === "totp"
      ? await tx.adminMfaCredential.updateMany({
          where: {
            id: credentialId,
            status: "ACTIVE",
            OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: factor.counter } }],
          },
          data: { lastUsedCounter: factor.counter },
        })
      : await tx.adminMfaRecoveryCode.updateMany({
          where: { id: factor.recoveryCodeId, credentialId, usedAt: null },
          data: { usedAt },
        });
    if (consumed.count !== 1) {
      throw new MfaException("MFA_INVALID_CODE", "Código de verificación inválido.");
    }
  }

  private validateTotp(secretBase32: string, token: string, timestamp = Date.now()): number | null {
    return this.totp(secretBase32, this.adminIdentityPolicy.accountEmail).validate({
      token,
      timestamp,
      window: TOTP_WINDOW,
    });
  }

  private totp(secretBase32: string, label: string): TOTP {
    return new TOTP({
      issuer: "ASODEF",
      label,
      algorithm: TOTP_ALGORITHM,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: Secret.fromBase32(secretBase32),
    });
  }

  private async requirePrivilegedUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE" ||
        !this.adminIdentityPolicy.isPrivilegedAdminEmail(user.email) ||
        !this.adminIdentityPolicy.mayAuthenticate(user.email)) {
      throw new MfaException("MFA_ADMIN_ONLY", "Operación disponible únicamente para la cuenta administrativa privilegiada.");
    }
    return user;
  }

  private enrollmentRateLimitKeys(
    purpose: string,
    userId: string,
    sessionId: string,
    context: RequestContext,
  ): string[] {
    return [
      `admin-mfa-enrollment:${purpose}:session:${userId}:${sessionId}`,
      `admin-mfa-enrollment:${purpose}:ip:${sha256(context.ipAddress ?? "unknown")}`,
    ];
  }

  private mfaLoginIpRateLimitKey(context: RequestContext): string {
    return `admin-mfa-login:ip:${sha256(context.ipAddress ?? "unknown")}`;
  }

  private mfaLoginRateLimitKeys(userId: string, context: RequestContext): string[] {
    return [
      `admin-mfa-login:user:${userId}`,
      this.mfaLoginIpRateLimitKey(context),
    ];
  }

  private async assertMfaLoginRateLimit(keys: string[]): Promise<void> {
    const maxAttempts = this.config.get("ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS", { infer: true });
    try {
      const states = await Promise.all(keys.map((key) => this.rateLimiter.peekStrict(key, maxAttempts)));
      if (states.some((state) => state.limited)) {
        throw new MfaException("MFA_ATTEMPTS_EXCEEDED", "Se agotaron los intentos de verificación MFA.");
      }
    } catch (error) {
      if (error instanceof MfaException) throw error;
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new MfaException("MFA_NOT_AVAILABLE", "La verificación MFA no está disponible temporalmente.");
      }
      throw error;
    }
  }

  private async incrementMfaLoginFailures(keys: string[]): Promise<void> {
    const maxAttempts = this.config.get("ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS", { infer: true });
    const windowSeconds = this.config.get("ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS", { infer: true });
    try {
      await Promise.all(keys.map((key) => this.rateLimiter.checkAndIncrementStrict(key, maxAttempts, windowSeconds)));
    } catch (error) {
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new MfaException("MFA_NOT_AVAILABLE", "La verificación MFA no está disponible temporalmente.");
      }
      throw error;
    }
  }

  /** Enrollment cannot use the normal MFA step-up flow because no factor
   * exists yet. It therefore performs a strict password re-authentication
   * against the current official ACTIVE account and current live session.
   * The same bounded policy as administrative step-up is reused, but Redis
   * fails closed because this endpoint exposes/activates a new credential. */
  private async requireEnrollmentPassword(
    user: User,
    sessionId: string,
    password: string,
    context: RequestContext,
    keys: string[],
    failureWindowSeconds: number,
  ): Promise<void> {
    const maxAttempts = this.config.get("ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS", { infer: true });
    try {
      const states = await Promise.all(keys.map((key) => this.rateLimiter.peekStrict(key, maxAttempts)));
      if (states.some((state) => state.limited)) {
        throw new MfaException("MFA_ATTEMPTS_EXCEEDED", "Se agotaron los intentos de inscripción MFA.");
      }
    } catch (error) {
      if (error instanceof MfaException) throw error;
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new MfaException("MFA_NOT_AVAILABLE", "La inscripción MFA no está disponible temporalmente.");
      }
      throw error;
    }

    const now = new Date();
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (!session) throw new MfaException("MFA_CONFLICT", "La sesión ya no está disponible.");

    if (!(await this.passwordService.verify(user.passwordHash, password))) {
      await this.recordEnrollmentFailure(
        keys,
        failureWindowSeconds,
        user.id,
        context,
        "ENROLLMENT_PASSWORD_INVALID",
      );
      throw new MfaException("MFA_PASSWORD_INVALID", "La contraseña actual no es válida.");
    }
  }

  private async recordEnrollmentFailure(
    keys: string[],
    windowSeconds: number,
    userId: string,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    const maxAttempts = this.config.get("ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS", { infer: true });
    try {
      await Promise.all(keys.map((key) => this.rateLimiter.checkAndIncrementStrict(key, maxAttempts, windowSeconds)));
    } catch (error) {
      await this.record("MFA_FAILED", userId, context, { reason: `${reason}_RATE_LIMIT_UNAVAILABLE` });
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new MfaException("MFA_NOT_AVAILABLE", "La inscripción MFA no está disponible temporalmente.");
      }
      throw error;
    }
    await this.record("MFA_FAILED", userId, context, { reason });
  }

  private async assertCurrentEnrollmentPrincipal(
    tx: Prisma.TransactionClient,
    expectedUser: User,
    sessionId: string,
    authenticatedAt: Date,
  ): Promise<void> {
    const currentUser = await tx.user.findUnique({ where: { id: expectedUser.id } });
    if (!currentUser || currentUser.status !== "ACTIVE" ||
        currentUser.passwordHash !== expectedUser.passwordHash ||
        !this.adminIdentityPolicy.isPrivilegedAdminEmail(currentUser.email) ||
        !this.adminIdentityPolicy.mayAuthenticate(currentUser.email)) {
      throw new MfaException("MFA_PASSWORD_INVALID", "La autenticación reciente no pudo validarse.");
    }
    const marked = await tx.session.updateMany({
      where: {
        id: sessionId,
        userId: currentUser.id,
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: authenticatedAt },
      },
      data: { recentAuthenticationAt: authenticatedAt },
    });
    if (marked.count !== 1) throw new MfaException("MFA_CONFLICT", "La sesión ya no está disponible.");
  }

  private async requireActiveCredential(userId: string) {
    const credential = await this.prisma.adminMfaCredential.findUnique({ where: { userId } });
    if (!credential || credential.status !== "ACTIVE") {
      throw new MfaException("MFA_NOT_AVAILABLE", "MFA no está habilitado.");
    }
    return credential;
  }

  private async requirePassword(user: User, password: string): Promise<void> {
    if (!(await this.passwordService.verify(user.passwordHash, password))) {
      throw new MfaException("MFA_PASSWORD_INVALID", "La contraseña actual no es válida.");
    }
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = randomBytes(6).toString("hex").toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    });
  }

  private invalidChallenge(): MfaException {
    return new MfaException("MFA_CHALLENGE_INVALID", "El desafío MFA no es válido.");
  }

  private async record(type: Parameters<SecurityEventService["record"]>[0]["type"], userId: string, context: RequestContext, metadata?: Record<string, string>): Promise<void> {
    await this.securityEvents.record({
      type,
      userId,
      actorUserId: userId,
      subjectUserId: userId,
      result: type === "MFA_FAILED" ? "FAILURE" : "SUCCESS",
      reason: metadata?.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      correlationId: context.correlationId,
      metadata,
    });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
