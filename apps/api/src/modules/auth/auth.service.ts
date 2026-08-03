import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { LoginFailureCategory, User } from "@prisma/client";
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

const SAFE_INVALID_CREDENTIALS_MESSAGE = "Credenciales inválidas.";
const SAFE_UNAUTHENTICATED_MESSAGE = "No autenticado.";
// Never surfaced to the client - retryAfterSeconds is the only thing the
// 429 response carries beyond a generic message.
const SAFE_RATE_LIMITED_MESSAGE = "Demasiados intentos. Intenta nuevamente más tarde.";

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
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
      throw new RateLimitedException(rateLimit.retryAfterSeconds);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always verify against *some* hash, real or a fixed dummy, so the
    // response time for "no such email" and "wrong password" is the same
    // shape of work - this is what prevents timing-based enumeration.
    const hashToVerify = user?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await this.passwordService.verify(hashToVerify, dto.password);

    const failureCategory = this.classifyLoginFailure(user, passwordMatches);
    const succeeded = failureCategory === null;

    await this.loginAttemptService.recordAttempt({
      email,
      userId: user?.id ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: succeeded,
      failureCategory: failureCategory ?? undefined,
      requestId: context.requestId,
    });

    if (!succeeded) {
      await this.handleFailedLogin(user, failureCategory, context);
      // Identical response for every failure reason - invalid email,
      // wrong password, locked, inactive, suspended - so none of them are
      // distinguishable to the caller.
      throw new UnauthorizedException(SAFE_INVALID_CREDENTIALS_MESSAGE);
    }

    // succeeded === true guarantees `user` is non-null and ACTIVE.
    const activeUser = user as User;

    if (this.passwordService.needsRehash(activeUser.passwordHash)) {
      const rehashed = await this.passwordService.hash(dto.password);
      await this.prisma.user.update({ where: { id: activeUser.id }, data: { passwordHash: rehashed } });
    }

    await this.loginAttemptService.registerSuccessfulLogin(activeUser.id);

    const { session, rawRefreshToken } = await this.sessionService.createSession(activeUser.id, context);
    const accessToken = this.tokenService.signAccessToken({ sub: activeUser.id, sid: session.id });

    await this.securityEventService.record({
      type: "SESSION_CREATED",
      userId: activeUser.id,
      sessionId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
    await this.securityEventService.record({
      type: "LOGIN_SUCCEEDED",
      userId: activeUser.id,
      sessionId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    return { accessToken, rawRefreshToken, user: toSafeUser(activeUser) };
  }

  private classifyLoginFailure(user: User | null, passwordMatches: boolean): LoginFailureCategory | null {
    if (!user) return "INVALID_CREDENTIALS";
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

    if (session.rotatedAt || session.revokedAt) {
      await this.detectReplay(session.familyId, session.id, session.userId, context);
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const rotation = await this.sessionService.rotateSession(session, context);
    if (rotation.outcome === "replay") {
      await this.detectReplay(rotation.familyId, session.id, session.userId, context);
      throw new UnauthorizedException(SAFE_UNAUTHENTICATED_MESSAGE);
    }

    const accessToken = this.tokenService.signAccessToken({ sub: user.id, sid: rotation.session.id });

    await this.securityEventService.record({
      type: "SESSION_REFRESHED",
      userId: user.id,
      sessionId: rotation.session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    return { accessToken, rawRefreshToken: rotation.rawRefreshToken };
  }

  private async detectReplay(
    familyId: string,
    sessionId: string,
    userId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.sessionService.revokeFamily(familyId, "REFRESH_TOKEN_REUSE_DETECTED");
    await this.securityEventService.record({
      type: "REFRESH_TOKEN_REUSE_DETECTED",
      userId,
      sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { familyId },
    });
  }

  /** Idempotent by design: a missing cookie or an already-revoked session
   * both succeed silently rather than erroring. */
  async logout(rawRefreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawRefreshToken) return;

    const session = await this.sessionService.findByRawRefreshToken(rawRefreshToken);
    if (!session) return;

    if (!session.revokedAt) {
      await this.sessionService.revokeSession(session.id, "LOGOUT");
      await this.securityEventService.record({
        type: "SESSION_REVOKED",
        userId: session.userId,
        sessionId: session.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: "LOGOUT" },
      });
    }

    await this.securityEventService.record({
      type: "LOGOUT",
      userId: session.userId,
      sessionId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
  }

  async logoutAll(userId: string, context: RequestContext): Promise<void> {
    await this.sessionService.revokeAllForUser(userId, "LOGOUT_ALL");
    await this.securityEventService.record({
      type: "LOGOUT_ALL",
      userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
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
