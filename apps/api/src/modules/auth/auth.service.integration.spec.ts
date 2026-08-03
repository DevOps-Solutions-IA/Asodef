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
import { SecurityEventService } from "./security-event.service";
import { RateLimiterService } from "./rate-limiter.service";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { RedisModule } from "../../common/redis/redis.module";
import { validateEnv } from "../../config/env.validation";

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
