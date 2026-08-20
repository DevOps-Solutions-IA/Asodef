import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import type { User, UserStatus } from "@prisma/client";
import { AuthService, RateLimitedException } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { SessionService } from "./session.service";
import { LoginAttemptService } from "./login-attempt.service";
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { RateLimiterService } from "./rate-limiter.service";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { RedisModule } from "../../common/redis/redis.module";
import { validateEnv } from "../../config/env.validation";
import { AdminIdentityPolicy } from "./admin-identity.policy";
import { AdminMfaService } from "./mfa/admin-mfa.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("AuthService (integration, real Postgres + Redis, no mocking of business logic)", () => {
  let moduleRef: TestingModule;
  let authService: AuthService;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  let ipCounter = 0;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        JwtModule.register({}),
        PrismaModule,
        RedisModule,
      ],
      providers: [
        AuthService,
        PasswordService,
        TokenService,
        SessionService,
        LoginAttemptService,
        SecurityEventService,
        RateLimiterService,
        AdminIdentityPolicy,
        { provide: AdminMfaService, useValue: { isEnforcementRequiredFor: () => false } },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    authService = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    passwordService = moduleRef.get(PasswordService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    // moduleRef.close() already runs RedisService's own onModuleDestroy
    // (which calls quit() once) - calling quit() again here manually
    // would double-close an already-closed connection and throw.
    await moduleRef.close();
  });

  /** A fresh IP per test so Redis-backed login rate limiting (shared
   * across all tests hitting the same key) never cross-contaminates
   * unrelated tests - only the dedicated rate-limiting test reuses one. */
  function uniqueContext() {
    ipCounter += 1;
    // TEST-NET-3 (203.0.113.0/24, RFC 5737) with a unique final octet-ish
    // suffix per call - real-looking, and unique enough that the
    // Redis-backed rate limiter never sees two tests as the same "IP".
    return {
      ipAddress: `203.0.113.${ipCounter}`,
      userAgent: "jest-integration-agent",
      requestId: randomUUID(),
    };
  }

  async function createUser(options: { status?: UserStatus; passwordHash?: string } = {}): Promise<User> {
    const passwordHash = options.passwordHash ?? (await passwordService.hash(TEST_PASSWORD));
    const user = await prisma.user.create({
      data: {
        email: `test-${randomUUID()}@example.com`,
        passwordHash,
        fullName: "Test User",
        status: options.status ?? "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  describe("login", () => {
    it("succeeds with a valid email and password, returning a safe user and tokens", async () => {
      const user = await createUser();
      const result = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      expect(result.user).toEqual({ id: user.id, email: user.email, fullName: user.fullName, status: "ACTIVE" });
      expect(result.accessToken).toBeTruthy();
      expect(result.rawRefreshToken).toBeTruthy();
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("rejects an email that does not exist", async () => {
      await expect(
        authService.login({ email: `nobody-${randomUUID()}@example.com`, password: "anything" }, uniqueContext()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects the correct email with the wrong password", async () => {
      const user = await createUser();
      await expect(
        authService.login({ email: user.email, password: "totally-wrong-password" }, uniqueContext()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects the recovery-only email even when a matching active User row and password exist", async () => {
      const recoveryUser = await prisma.user.create({
        data: {
          email: "asodefsas@gmail.com",
          passwordHash: await passwordService.hash(TEST_PASSWORD),
          fullName: "Recovery channel must not authenticate",
          status: "ACTIVE",
        },
      });
      createdUserIds.push(recoveryUser.id);

      await expect(authService.login(
        { email: recoveryUser.email, password: TEST_PASSWORD },
        uniqueContext(),
      )).rejects.toThrow(UnauthorizedException);
      expect(await prisma.session.count({ where: { userId: recoveryUser.id } })).toBe(0);
    });

    it("returns the identical public error message for an unknown email and a wrong password", async () => {
      const user = await createUser();
      const context1 = uniqueContext();
      const context2 = uniqueContext();

      let unknownEmailError: unknown;
      let wrongPasswordError: unknown;
      try {
        await authService.login({ email: `nobody-${randomUUID()}@example.com`, password: "x" }, context1);
      } catch (error) {
        unknownEmailError = error;
      }
      try {
        await authService.login({ email: user.email, password: "wrong" }, context2);
      } catch (error) {
        wrongPasswordError = error;
      }

      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmailError as UnauthorizedException).message).toBe(
        (wrongPasswordError as UnauthorizedException).message,
      );
    });

    it("normalizes email case and surrounding whitespace before lookup", async () => {
      const user = await createUser();
      const result = await authService.login(
        { email: `  ${user.email.toUpperCase()}  `, password: TEST_PASSWORD },
        uniqueContext(),
      );
      expect(result.user.id).toBe(user.id);
    });

    it("rejects an inactive account with the same generic message", async () => {
      const user = await createUser({ status: "INACTIVE" });
      await expect(authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a suspended account with the same generic message", async () => {
      const user = await createUser({ status: "SUSPENDED" });
      await expect(authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("records a LoginAttempt row for a failed login, with a failure category but no password", async () => {
      const user = await createUser();
      const context = uniqueContext();
      await expect(
        authService.login({ email: user.email, password: "wrong-password" }, context),
      ).rejects.toThrow();

      const attempt = await prisma.loginAttempt.findFirst({
        where: { email: user.email, requestId: context.requestId },
      });
      expect(attempt).not.toBeNull();
      expect(attempt?.success).toBe(false);
      expect(attempt?.failureCategory).toBe("INVALID_CREDENTIALS");
      expect(JSON.stringify(attempt)).not.toContain("wrong-password");
    });

    it("locks the account after the configured number of failed attempts, then rejects even the correct password", async () => {
      const user = await createUser();
      const maxAttempts = 5; // matches env.validation.ts's LOGIN_MAX_FAILED_ATTEMPTS default

      for (let i = 0; i < maxAttempts; i++) {
        await expect(
          authService.login({ email: user.email, password: "wrong-password" }, uniqueContext()),
        ).rejects.toThrow(UnauthorizedException);
      }

      const lockedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(lockedUser.lockedUntil).not.toBeNull();
      expect(lockedUser.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // Even the *correct* password now fails, generically.
      await expect(authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext())).rejects.toThrow(
        UnauthorizedException,
      );

      const lockedEvent = await prisma.securityEvent.findFirst({
        where: { userId: user.id, type: "ACCOUNT_LOCKED" },
      });
      expect(lockedEvent).not.toBeNull();
    });

    it("does not lock the account at one attempt below the configured threshold (US-009)", async () => {
      const user = await createUser();
      const maxAttempts = 5;

      for (let i = 0; i < maxAttempts - 1; i++) {
        await expect(
          authService.login({ email: user.email, password: "wrong-password" }, uniqueContext()),
        ).rejects.toThrow(UnauthorizedException);
      }

      const stillUnlocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stillUnlocked.lockedUntil).toBeNull();
      expect(stillUnlocked.failedLoginAttempts).toBe(maxAttempts - 1);

      // The correct password still works - not locked yet.
      const result = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      expect(result.user.id).toBe(user.id);
    });

    it("locks the account correctly under real concurrent failed attempts (US-009 concurrency safety)", async () => {
      const user = await createUser();
      const maxAttempts = 5;

      // Fire more concurrent failures than the threshold - a naive
      // read-then-write counter would lose updates here and either
      // under- or over-count, potentially never locking or locking with
      // a wildly wrong count. Every one of these must still reject with
      // the identical generic message regardless of internal accounting.
      const attempts = Array.from({ length: maxAttempts + 3 }, () =>
        authService.login({ email: user.email, password: "wrong-password" }, uniqueContext()),
      );
      const results = await Promise.allSettled(attempts);
      expect(results.every((r) => r.status === "rejected")).toBe(true);

      const lockedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(lockedUser.lockedUntil).not.toBeNull();
      expect(lockedUser.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      // The counter must reflect every single concurrent failure, not a
      // lower number from lost updates.
      expect(lockedUser.failedLoginAttempts).toBe(maxAttempts + 3);

      // Exactly one ACCOUNT_LOCKED event - the atomic claim must ensure
      // only the single winning concurrent request reports justLocked.
      const lockedEvents = await prisma.securityEvent.findMany({
        where: { userId: user.id, type: "ACCOUNT_LOCKED" },
      });
      expect(lockedEvents).toHaveLength(1);
    });

    it("does not extend the lockout window on further attempts against an already-locked account", async () => {
      const user = await createUser();
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 },
      });

      await expect(
        authService.login({ email: user.email, password: "wrong-password" }, uniqueContext()),
      ).rejects.toThrow(UnauthorizedException);

      const stillLocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stillLocked.failedLoginAttempts).toBe(5); // unchanged - not incremented while locked
    });

    it("allows login again once the lockout window has passed", async () => {
      const user = await createUser();
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 5 },
      });

      const result = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      expect(result.user.id).toBe(user.id);
    });

    it("resets failedLoginAttempts/lockedUntil and stamps lastLoginAt on successful login", async () => {
      const user = await createUser();
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 3 } });

      await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.failedLoginAttempts).toBe(0);
      expect(updated.lockedUntil).toBeNull();
      expect(updated.lastLoginAt).not.toBeNull();
    });

    it("rolls Session, successful LoginAttempt, lastLoginAt, and success events back as one unit", async () => {
      const user = await createUser();
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 3 } });
      const requiredEventFailure = jest
        .spyOn(moduleRef.get(SecurityEventService), "recordRequired")
        .mockRejectedValueOnce(new Error("mandatory login audit unavailable"));

      try {
        await expect(
          authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext()),
        ).rejects.toThrow("mandatory login audit unavailable");
      } finally {
        requiredEventFailure.mockRestore();
      }

      const persistedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(persistedUser.lastLoginAt).toBeNull();
      expect(persistedUser.failedLoginAttempts).toBe(3);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.loginAttempt.count({ where: { userId: user.id, success: true } })).toBe(0);
      expect(await prisma.securityEvent.count({
        where: { userId: user.id, type: { in: ["SESSION_CREATED", "LOGIN_SUCCEEDED"] } },
      })).toBe(0);
    });

    it("transparently rehashes a password stored with weaker-than-configured argon2 parameters", async () => {
      const argon2 = await import("argon2");
      const weakHash = await argon2.hash(TEST_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 8192,
        timeCost: 2,
        parallelism: 1,
      });
      const user = await createUser({ passwordHash: weakHash });

      await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.passwordHash).not.toBe(weakHash);
      expect(passwordService.needsRehash(updated.passwordHash)).toBe(false);
    });

    it("enforces IP-based rate limiting after too many attempts from the same address", async () => {
      const user = await createUser();
      const context = { ipAddress: `198.51.100.${randomUUID().slice(0, 2)}`, userAgent: "rl-agent", requestId: null };

      // LOGIN_RATE_LIMIT_MAX default is 10.
      for (let i = 0; i < 10; i++) {
        await expect(
          authService.login({ email: user.email, password: "wrong" }, context),
        ).rejects.toThrow();
      }

      await expect(authService.login({ email: user.email, password: TEST_PASSWORD }, context)).rejects.toThrow(
        RateLimitedException,
      );
    });

    it("records a LOCKOUT_RATE_LIMITED security event when the IP rate limit trips (US-009)", async () => {
      const user = await createUser();
      const context = { ipAddress: `198.51.100.${randomUUID().slice(0, 2)}`, userAgent: "rl-event-agent", requestId: null };

      for (let i = 0; i < 10; i++) {
        await expect(authService.login({ email: user.email, password: "wrong" }, context)).rejects.toThrow();
      }
      await expect(authService.login({ email: user.email, password: TEST_PASSWORD }, context)).rejects.toThrow(
        RateLimitedException,
      );

      const event = await prisma.securityEvent.findFirst({
        where: { type: "LOCKOUT_RATE_LIMITED", ipAddress: context.ipAddress },
      });
      expect(event).not.toBeNull();
    });

    it("preserves every historical LoginAttempt row through a full lock -> expire -> unlock cycle (US-009)", async () => {
      const user = await createUser();
      const maxAttempts = 5;

      for (let i = 0; i < maxAttempts; i++) {
        await expect(
          authService.login({ email: user.email, password: "wrong-password" }, uniqueContext()),
        ).rejects.toThrow();
      }
      const attemptsAfterLock = await prisma.loginAttempt.count({ where: { userId: user.id } });
      expect(attemptsAfterLock).toBe(maxAttempts);

      // Force the lockout window into the past, then log in successfully.
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      // Automatic unlock/reset must never delete history - every prior
      // failed attempt row, plus the new successful one, must still exist.
      const attemptsAfterUnlock = await prisma.loginAttempt.count({ where: { userId: user.id } });
      expect(attemptsAfterUnlock).toBe(maxAttempts + 1);
    });

    it("records LOCKOUT_EXPIRED exactly once when a stale lockout is first observed, regardless of outcome (US-009)", async () => {
      const user = await createUser();
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 5 },
      });

      // First post-expiration attempt fails (wrong password) - the
      // expiration is still detected and recorded exactly once.
      await expect(
        authService.login({ email: user.email, password: "still-wrong" }, uniqueContext()),
      ).rejects.toThrow();

      const events = await prisma.securityEvent.findMany({ where: { userId: user.id, type: "LOCKOUT_EXPIRED" } });
      expect(events).toHaveLength(1);

      // A second subsequent attempt (even if it also fails) must not
      // re-record LOCKOUT_EXPIRED - lockedUntil is already null by now.
      await expect(
        authService.login({ email: user.email, password: "still-wrong-again" }, uniqueContext()),
      ).rejects.toThrow();
      const eventsAfterSecondAttempt = await prisma.securityEvent.findMany({
        where: { userId: user.id, type: "LOCKOUT_EXPIRED" },
      });
      expect(eventsAfterSecondAttempt).toHaveLength(1);
    });

    it("resets the failed-attempt counter from an expired lockout rather than compounding it (US-009)", async () => {
      const user = await createUser();
      // Simulate a fully-elapsed prior lockout episode: counter still at
      // the threshold, but the window has passed.
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 5 },
      });

      // A single new failure right after expiration must NOT immediately
      // re-lock the account by compounding the stale counter (5 -> 6) -
      // it must restart from a clean baseline (0 -> 1).
      await expect(
        authService.login({ email: user.email, password: "wrong-password" }, uniqueContext()),
      ).rejects.toThrow(UnauthorizedException);

      const afterOneNewFailure = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(afterOneNewFailure.failedLoginAttempts).toBe(1);
      expect(afterOneNewFailure.lockedUntil).toBeNull();
    });
  });

  describe("login lockout under Redis outage (US-009 section 5)", () => {
    it("still enforces the database-backed account lockout when the IP rate limiter's Redis is unavailable", async () => {
      const brokenRateLimiter = {
        checkAndIncrement: async () => ({ limited: false, remaining: 999, retryAfterSeconds: 0 }),
      } as unknown as RateLimiterService;

      const isolatedModuleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
          JwtModule.register({}),
          PrismaModule,
          RedisModule,
        ],
        providers: [
          AuthService,
          PasswordService,
          TokenService,
          SessionService,
          LoginAttemptService,
          SecurityEventService,
          AdminIdentityPolicy,
          { provide: AdminMfaService, useValue: { isEnforcementRequiredFor: () => false } },
          { provide: RateLimiterService, useValue: brokenRateLimiter },
        ],
      }).compile();

      const isolatedAuthService = isolatedModuleRef.get(AuthService);
      const isolatedPrisma = isolatedModuleRef.get(PrismaService);
      const isolatedPasswordService = isolatedModuleRef.get(PasswordService);

      const user = await isolatedPrisma.user.create({
        data: {
          email: `redis-outage-${randomUUID()}@example.com`,
          passwordHash: await isolatedPasswordService.hash(TEST_PASSWORD),
          fullName: "Redis Outage Test User",
          status: "ACTIVE",
        },
      });

      try {
        // The IP rate limiter fails open (as documented) - it never
        // blocks these attempts. But the persistent, database-backed
        // account lockout is a completely separate mechanism and must
        // still activate exactly as it would with Redis healthy.
        const maxAttempts = 5;
        for (let i = 0; i < maxAttempts; i++) {
          await expect(
            isolatedAuthService.login({ email: user.email, password: "wrong" }, { ipAddress: "203.0.113.250", userAgent: "a", requestId: null }),
          ).rejects.toThrow(UnauthorizedException);
        }

        const lockedUser = await isolatedPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(lockedUser.lockedUntil).not.toBeNull();
        expect(lockedUser.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

        // Even the correct password is now rejected - Redis being down
        // never bypassed the DB-backed lockout.
        await expect(
          isolatedAuthService.login(
            { email: user.email, password: TEST_PASSWORD },
            { ipAddress: "203.0.113.250", userAgent: "a", requestId: null },
          ),
        ).rejects.toThrow(UnauthorizedException);
      } finally {
        await isolatedPrisma.user.delete({ where: { id: user.id } });
        await isolatedModuleRef.close();
      }
    });
  });

  describe("refresh", () => {
    it("rotates the refresh token and issues a new access token", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      const refreshed = await authService.refresh(login.rawRefreshToken, uniqueContext());

      expect(refreshed.rawRefreshToken).not.toBe(login.rawRefreshToken);
      expect(refreshed.accessToken).toBeTruthy();
    });

    it("rejects the previous (already-rotated) refresh token after a rotation", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      await authService.refresh(login.rawRefreshToken, uniqueContext());

      await expect(authService.refresh(login.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);
    });

    it("detects reuse of a rotated token as replay and revokes the whole token family, including the newest token", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      const firstRefresh = await authService.refresh(login.rawRefreshToken, uniqueContext());

      // Reuse the original (now-superseded) token - this is the replay.
      await expect(authService.refresh(login.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);

      const reuseEvent = await prisma.securityEvent.findFirst({
        where: { userId: user.id, type: "REFRESH_TOKEN_REUSE_DETECTED" },
        orderBy: { createdAt: "desc" },
      });
      expect(reuseEvent).not.toBeNull();

      // The entire family, including the most recently issued (and
      // otherwise still-valid) token, must now be revoked.
      await expect(authService.refresh(firstRefresh.rawRefreshToken, uniqueContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("does not let two concurrent refresh attempts with the same token both succeed", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      const [first, second] = await Promise.allSettled([
        authService.refresh(login.rawRefreshToken, uniqueContext()),
        authService.refresh(login.rawRefreshToken, uniqueContext()),
      ]);

      const outcomes = [first.status, second.status];
      expect(outcomes.filter((status) => status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((status) => status === "rejected")).toHaveLength(1);

      // A concurrent use is replay, not a harmless duplicate. Once both
      // requests settle, even the token returned by the winner belongs to the
      // compromised family and must be unusable.
      const winner = [first, second].find((result): result is PromiseFulfilledResult<Awaited<ReturnType<AuthService["refresh"]>>> =>
        result.status === "fulfilled",
      );
      expect(winner).toBeDefined();
      await expect(authService.refresh(winner!.value.rawRefreshToken, uniqueContext()))
        .rejects.toThrow(UnauthorizedException);
    });

    it("rolls refresh rotation back when its mandatory event cannot persist", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      const original = await prisma.session.findFirstOrThrow({ where: { userId: user.id, rotatedAt: null } });
      const events = moduleRef.get(SecurityEventService);
      const failure = jest.spyOn(events, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));
      try {
        await expect(authService.refresh(login.rawRefreshToken, uniqueContext())).rejects.toThrow("event unavailable");
      } finally {
        failure.mockRestore();
      }
      expect(await prisma.session.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ rotatedAt: null });
      expect(await prisma.session.count({ where: { familyId: original.familyId } })).toBe(1);
    });

    it("rejects an expired session", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      await expect(authService.refresh(login.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);
    });

    it("rejects a revoked session", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedReason: "LOGOUT" } });

      await expect(authService.refresh(login.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);
    });

    it("rejects a refresh call with no token", async () => {
      await expect(authService.refresh(undefined, uniqueContext())).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("logout / logout-all", () => {
    it("revokes the session so its refresh token stops working", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      await authService.logout(login.rawRefreshToken, uniqueContext());

      await expect(authService.refresh(login.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);
    });

    it("is idempotent: logging out twice with the same token does not throw", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      await expect(authService.logout(login.rawRefreshToken, uniqueContext())).resolves.not.toThrow();
      await expect(authService.logout(login.rawRefreshToken, uniqueContext())).resolves.not.toThrow();
    });

    it("succeeds safely when called with no refresh token at all", async () => {
      await expect(authService.logout(undefined, uniqueContext())).resolves.not.toThrow();
    });

    it("logout-all revokes every session belonging to the user, not just the current one", async () => {
      const user = await createUser();
      const loginA = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      const loginB = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      await authService.logoutAll(user.id, uniqueContext());

      await expect(authService.refresh(loginA.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);
      await expect(authService.refresh(loginB.rawRefreshToken, uniqueContext())).rejects.toThrow(UnauthorizedException);

      const logoutAllEvent = await prisma.securityEvent.findFirst({ where: { userId: user.id, type: "LOGOUT_ALL" } });
      expect(logoutAllEvent).not.toBeNull();
    });

    it("rolls logout revocation back when its mandatory event cannot persist", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id, revokedAt: null } });
      const events = moduleRef.get(SecurityEventService);
      const failure = jest.spyOn(events, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));
      try {
        await expect(authService.logout(login.rawRefreshToken, uniqueContext())).rejects.toThrow("event unavailable");
      } finally {
        failure.mockRestore();
      }
      expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ revokedAt: null });
    });
  });

  describe("secret redaction across the whole flow", () => {
    it("never persists the plaintext password anywhere (LoginAttempt, SecurityEvent, or User.passwordHash)", async () => {
      const distinctivePassword = `secret-marker-${randomUUID()}`;
      const user = await createUser({ passwordHash: await passwordService.hash(distinctivePassword) });

      await authService.login({ email: user.email, password: distinctivePassword }, uniqueContext());
      await expect(
        authService.login({ email: user.email, password: "wrong-one" }, uniqueContext()),
      ).rejects.toThrow();

      const [attempts, events, storedUser] = await Promise.all([
        prisma.loginAttempt.findMany({ where: { email: user.email } }),
        prisma.securityEvent.findMany({ where: { userId: user.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ]);

      expect(JSON.stringify(attempts)).not.toContain(distinctivePassword);
      expect(JSON.stringify(events)).not.toContain(distinctivePassword);
      expect(storedUser.passwordHash).not.toContain(distinctivePassword);
    });

    it("never persists a raw refresh token anywhere - only its hash", async () => {
      const user = await createUser();
      const login = await authService.login({ email: user.email, password: TEST_PASSWORD }, uniqueContext());

      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.refreshTokenHash).not.toBe(login.rawRefreshToken);
      expect(session.refreshTokenHash).not.toContain(login.rawRefreshToken);
    });
  });
});
