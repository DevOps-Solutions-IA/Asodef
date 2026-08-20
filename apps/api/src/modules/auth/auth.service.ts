import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type LoginFailureCategory, type User } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { SessionService } from "./session.service";
import { LoginAttemptService } from "./login-attempt.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { RateLimiterService } from "./rate-limiter.service";
import type { LoginDto } from "./dto/login.dto";
import type { EnvConfig } from "../../config/env.validation";
import type { RequestUser } from "./types/request-user.type";
import { AdminIdentityPolicy } from "./admin-identity.policy";
import { AdminMfaService } from "./mfa/admin-mfa.service";
import { MfaRequiredException } from "./mfa/mfa.types";

const SAFE_INVALID_CREDENTIALS_MESSAGE = "Credenciales inválidas.";
const SAFE_UNAUTHENTICATED_MESSAGE = "No autenticado.";
// Never surfaced to the client - retryAfterSeconds is the only thing the
// 429 response carries beyond a generic message.
const SAFE_RATE_LIMITED_MESSAGE = "Demasiados intentos. Intenta nuevamente más tarde.";

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
}

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  status: User["status"];
}

export interface LoginResult {
  accessToken: string;
  rawRefreshToken: string;
  user: SafeUser;
}

export interface RefreshResult {
  accessToken: string;
  rawRefreshToken: string;
}

export class RateLimitedException extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(SAFE_RATE_LIMITED_MESSAGE);
  }
}

function toSafeUser(user: User): SafeUser {
  return { id: user.id, email: user.email, fullName: user.fullName, status: user.status };
}

@Injectable()
export class AuthService {
  private dummyHashPromise: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly securityEventService: SecurityEventService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly adminIdentityPolicy: AdminIdentityPolicy,
    private readonly adminMfaService: AdminMfaService,
  ) {}

  /** Computed once and cached so every "user not found" login takes
   * roughly the same time as a real verification - never generated fresh
   * per request. */
  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.passwordService.hash("timing-safety-placeholder-password");
    }
    return this.dummyHashPromise;
  }

  async login(dto: LoginDto, context: RequestContext): Promise<LoginResult> {
    const email = dto.email.trim().toLowerCase();

    const rateLimit = await this.rateLimiterService.checkAndIncrement(
      `login:ip:${context.ipAddress ?? "unknown"}`,
      this.configService.get("LOGIN_RATE_LIMIT_MAX", { infer: true }),
      this.configService.get("LOGIN_RATE_LIMIT_WINDOW_SECONDS", { infer: true }),
    );
    if (rateLimit.limited) {
      await this.loginAttemptService.recordAttempt({
        email,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        success: false,
        failureCategory: "RATE_LIMITED",
        requestId: context.requestId,
      });
      // Distinct from LOGIN_FAILED (US-009): this is the coarse IP-level
      // control rejecting the request before any account-specific logic
      // ran at all - userId is never known at this point, by design (see
      // RateLimiterService's doc comment: an obviously-throttled request
      // shouldn't cost a DB lookup).
      await this.securityEventService.record({
        type: "LOCKOUT_RATE_LIMITED",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
      throw new RateLimitedException(rateLimit.retryAfterSeconds);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // US-009: detected here, once, from the pre-attempt state - regardless
    // of whether the attempt that follows succeeds or fails. Whichever
    // branch runs next (handleFailedLogin or the success path) will
    // itself clear the stale counter/lockedUntil; this only records that
    // the transition happened, exactly once (the DB write already
    // guarantees the *next* login attempt no longer sees a set
    // lockedUntil, so there is nothing to re-detect on a later call).
    if (user && this.loginAttemptService.wasLockoutJustExpired(user)) {
      await this.securityEventService.record({
        type: "LOCKOUT_EXPIRED",
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
    }

    // Always verify against *some* hash, real or a fixed dummy, so the
    // response time for "no such email" and "wrong password" is the same
    // shape of work - this is what prevents timing-based enumeration.
    const hashToVerify = user?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.passwordService.verify(hashToVerify, dto.password);

    const failureCategory = this.classifyLoginFailure(user, passwordMatches, this.adminIdentityPolicy.mayAuthenticate(email));
    const succeeded = failureCategory === null;

    if (!succeeded) {
      await this.loginAttemptService.recordAttempt({
        email,
        userId: user?.id ?? null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        success: false,
        failureCategory,
        requestId: context.requestId,
      });
      await this.handleFailedLogin(user, failureCategory, context);
      // Identical response for every failure reason - invalid email,
      // wrong password, locked, inactive, suspended - so none of them are
      // distinguishable to the caller.
      throw new UnauthorizedException(SAFE_INVALID_CREDENTIALS_MESSAGE);
    }

    // succeeded === true guarantees `user` is non-null and ACTIVE.
    let activeUser = user as User;

    if (this.passwordService.needsRehash(activeUser.passwordHash)) {
      const rehashed = await this.passwordService.hash(dto.password);
      activeUser = await this.prisma.user.update({ where: { id: activeUser.id }, data: { passwordHash: rehashed } });
    }

    if (this.adminMfaService.isEnforcementRequiredFor(activeUser.email)) {
      const challenge = await this.adminMfaService.createLoginChallenge(activeUser, context);
      throw new MfaRequiredException(challenge.challengeToken, challenge.expiresAt);
    }

    return this.completeAuthenticatedLogin(activeUser, context);
  }

  async completeMfaLogin(challengeToken: string, code: string, context: RequestContext): Promise<LoginResult> {
    const persisted = await this.adminMfaService.completeLoginChallenge(
      challengeToken,
      code,
      context,
      (tx, user, verifiedAt) => this.persistAuthenticatedLogin(tx, user, context, verifiedAt),
    );
    return this.issueLoginResult(persisted);
  }

  private async completeAuthenticatedLogin(activeUser: User, context: RequestContext): Promise<LoginResult> {
    const persisted = await this.prisma.$transaction((tx) =>
      this.persistAuthenticatedLogin(tx, activeUser, context),
    );
    return this.issueLoginResult(persisted);
  }

  private async persistAuthenticatedLogin(
    tx: Prisma.TransactionClient,
    authenticatedUser: User,
    context: RequestContext,
    mfaVerifiedAt?: Date,
  ) {
    // Serialize against password/account-state mutations. Re-reading after
    // the row lock prevents a password reset/deactivation racing between
    // credential verification and Session creation.
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "users"
      WHERE "id" = ${authenticatedUser.id}::uuid
      FOR UPDATE
    `);
    const currentUser = await tx.user.findUnique({ where: { id: authenticatedUser.id } });
    if (!currentUser || currentUser.status !== "ACTIVE" ||
        !this.adminIdentityPolicy.mayAuthenticate(currentUser.email) ||
        currentUser.email !== authenticatedUser.email ||
        currentUser.passwordHash !== authenticatedUser.passwordHash ||
        currentUser.passwordChangedAt?.getTime() !== authenticatedUser.passwordChangedAt?.getTime()) {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const loginAt = mfaVerifiedAt ?? new Date();
    await this.loginAttemptService.recordAttempt({
      email: currentUser.email,
      userId: currentUser.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: true,
      requestId: context.requestId,
    }, tx);
    await this.loginAttemptService.registerSuccessfulLogin(currentUser.id, tx, loginAt);

    const { session, rawRefreshToken } = await this.sessionService.createSession(
      currentUser.id,
      context,
      tx,
      mfaVerifiedAt ? { mfaVerifiedAt, recentAuthenticationAt: mfaVerifiedAt } : {},
    );
    const eventContext = {
      userId: currentUser.id,
      actorUserId: currentUser.id,
      subjectUserId: currentUser.id,
      sessionId: session.id,
      result: "SUCCESS" as const,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      correlationId: context.correlationId,
    };
    await this.securityEventService.recordRequired(tx, { type: "SESSION_CREATED", ...eventContext });
    await this.securityEventService.recordRequired(tx, { type: "LOGIN_SUCCEEDED", ...eventContext });

    // Sign before the transaction commits. A signing/configuration failure
    // therefore cannot leave behind an unreachable "successful" session.
    const accessToken = this.tokenService.signAccessToken({ sub: currentUser.id, sid: session.id });
    return { accessToken, rawRefreshToken, user: currentUser };
  }

  private issueLoginResult(persisted: Awaited<ReturnType<AuthService["persistAuthenticatedLogin"]>>): LoginResult {
    return {
      accessToken: persisted.accessToken,
      rawRefreshToken: persisted.rawRefreshToken,
      user: toSafeUser(persisted.user),
    };
  }

  private classifyLoginFailure(
    user: User | null,
    passwordMatches: boolean,
    identityMayAuthenticate: boolean,
  ): LoginFailureCategory | null {
    if (!user) return "INVALID_CREDENTIALS";
    if (!identityMayAuthenticate) return "INVALID_CREDENTIALS";
    if (user.status === "SUSPENDED") return "ACCOUNT_SUSPENDED";
    if (user.status === "INACTIVE") return "ACCOUNT_INACTIVE";
    if (this.loginAttemptService.isLocked(user)) return "ACCOUNT_LOCKED";
    if (!passwordMatches) return "INVALID_CREDENTIALS";
    return null;
  }

  private async handleFailedLogin(
    user: User | null,
    failureCategory: LoginFailureCategory,
    context: RequestContext,
  ): Promise<void> {
    await this.securityEventService.record({
      type: "LOGIN_FAILED",
      userId: user?.id ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { failureCategory },
    });

    // Only real, currently-unlocked accounts accrue failed-attempt state -
    // there is nothing to lock for an email that doesn't exist, and an
    // already-locked account shouldn't have its lockout window extended by
    // continued attempts (that would let an attacker perpetually lock the
    // account out by repeatedly probing it).
    if (user && failureCategory === "INVALID_CREDENTIALS" && !this.loginAttemptService.isLocked(user)) {
      const { justLocked } = await this.loginAttemptService.registerFailedAttempt(user.id);
      if (justLocked) {
        await this.securityEventService.record({
          type: "ACCOUNT_LOCKED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
        });
      }
    }
  }

  async refresh(rawRefreshToken: string | undefined, context: RequestContext): Promise<RefreshResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const session = await this.sessionService.findByRawRefreshToken(rawRefreshToken);
    if (!session) {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== "ACTIVE" || !this.adminIdentityPolicy.mayAuthenticate(user.email)) {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    // Turning enforcement on invalidates every password-only administrator
    // session immediately. Refresh must enforce the same server-side rule as
    // JwtAuthGuard or an old cookie could mint a fresh access token forever.
    if (this.adminMfaService.isEnforcementRequiredFor(user.email) && !session.mfaVerifiedAt) {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const rotation = await this.sessionService.rotateSession(session, context, tx);
      if (rotation.outcome === "invalid") return rotation;
      if (rotation.outcome === "replay") {
        await this.securityEventService.recordRequired(tx, {
          type: "REFRESH_TOKEN_REUSE_DETECTED",
          userId: user.id,
          sessionId: session.id,
          result: "DENIED",
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          correlationId: context.correlationId,
          metadata: { familyId: rotation.familyId },
        });
        return rotation;
      }

      // Recheck the locked generation. A password/MFA mutation may clear
      // assurance after the pre-transaction lookup; returning a fresh but
      // immediately unusable privileged token would make the enforcement
      // boundary racy and obscure the required re-login.
      if (this.adminMfaService.isEnforcementRequiredFor(user.email) && !rotation.session.mfaVerifiedAt) {
        throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
      }

      await this.securityEventService.recordRequired(tx, {
        type: "SESSION_REFRESHED",
        userId: user.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        sessionId: rotation.session.id,
        result: "SUCCESS",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        correlationId: context.correlationId,
      });
      const accessToken = this.tokenService.signAccessToken({ sub: user.id, sid: rotation.session.id });
      return { outcome: "rotated" as const, accessToken, rawRefreshToken: rotation.rawRefreshToken };
    });

    if (result.outcome !== "rotated") throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    return { accessToken: result.accessToken, rawRefreshToken: result.rawRefreshToken };
  }

  /** Idempotent by design: a missing cookie or an already-revoked session
   * both succeed silently rather than erroring. */
  async logout(rawRefreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawRefreshToken) return;

    const session = await this.sessionService.findByRawRefreshToken(rawRefreshToken);
    if (!session) return;

    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
      });
      if (revoked.count === 1) {
        await this.securityEventService.recordRequired(tx, {
          type: "SESSION_REVOKED", userId: session.userId, actorUserId: session.userId,
          subjectUserId: session.userId, sessionId: session.id, result: "SUCCESS",
          ipAddress: context.ipAddress, userAgent: context.userAgent,
          requestId: context.requestId, correlationId: context.correlationId,
          metadata: { reason: "LOGOUT" },
        });
      }
      await this.securityEventService.recordRequired(tx, {
        type: "LOGOUT", userId: session.userId, actorUserId: session.userId,
        subjectUserId: session.userId, sessionId: session.id, result: "SUCCESS",
        ipAddress: context.ipAddress, userAgent: context.userAgent,
        requestId: context.requestId, correlationId: context.correlationId,
      });
    });
  }

  async logoutAll(userId: string, context: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.sessionService.revokeAllForUser(userId, "LOGOUT_ALL", tx);
      await this.securityEventService.recordRequired(tx, {
        type: "LOGOUT_ALL", userId, actorUserId: userId, subjectUserId: userId,
        result: "SUCCESS", ipAddress: context.ipAddress, userAgent: context.userAgent,
        requestId: context.requestId, correlationId: context.correlationId,
      });
    });
  }

  async getSessionMetadata(sessionId: string): Promise<{ createdAt: Date; lastUsedAt: Date | null } | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { createdAt: true, lastUsedAt: true },
    });
    return session;
  }

  toSafeCurrentUser(requestUser: RequestUser) {
    return {
      id: requestUser.id,
      email: requestUser.email,
      fullName: requestUser.fullName,
      status: requestUser.status,
      roles: requestUser.roles,
      permissions: requestUser.permissions,
    };
  }
}
