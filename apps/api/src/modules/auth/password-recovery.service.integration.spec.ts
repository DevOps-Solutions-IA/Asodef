import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { PasswordRecoveryService } from "./password-recovery.service";
import { PasswordRecoveryErrorCode } from "./password-recovery.types";
import { PasswordService } from "./password.service";
import { PasswordPolicyService } from "./password-policy/password-policy.service";
import { PasswordResetTokenService } from "./password-reset-token.service";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";
import { RateLimiterService } from "./rate-limiter.service";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InMemoryMailTransport } from "../notifications/in-memory-mail.transport";
import { MAIL_TRANSPORT, type MailTransport } from "../notifications/mail-transport.interface";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { RedisModule } from "../../common/redis/redis.module";
import { validateEnv } from "../../config/env.validation";

const CURRENT_PASSWORD = "Current-Password-99!";

function extractTokenFromResetUrl(body: string): string {
  const match = /token=([^&\s]+)/.exec(body);
  if (!match) throw new Error("no reset token found in captured email body");
  return decodeURIComponent(match[1]!);
}

describe("PasswordRecoveryService (integration, real Postgres + Redis, no mocking of business logic)", () => {
  let moduleRef: TestingModule;
  let service: PasswordRecoveryService;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let sessionService: SessionService;
  let tokenService: TokenService;
  let mailTransport: InMemoryMailTransport;
  const createdUserIds: string[] = [];
  let ipCounter = 0;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        JwtModule.register({}),
        PrismaModule,
        RedisModule,
        SecurityEventsModule,
        NotificationsModule,
      ],
      providers: [
        PasswordRecoveryService,
        PasswordService,
        PasswordPolicyService,
        PasswordResetTokenService,
        SessionService,
        TokenService,
        RateLimiterService,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    service = moduleRef.get(PasswordRecoveryService);
    prisma = moduleRef.get(PrismaService);
    passwordService = moduleRef.get(PasswordService);
    sessionService = moduleRef.get(SessionService);
    tokenService = moduleRef.get(TokenService);
    mailTransport = moduleRef.get(InMemoryMailTransport);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
  });

  afterEach(() => {
    mailTransport.clear();
  });

  function uniqueContext() {
    ipCounter += 1;
    return { ipAddress: `203.0.113.${100 + ipCounter}`, userAgent: "jest-integration-agent", requestId: randomUUID() };
  }

  async function createUser(overrides: Partial<User> = {}): Promise<User> {
    const passwordHash = overrides.passwordHash ?? (await passwordService.hash(CURRENT_PASSWORD));
    const user = await prisma.user.create({
      data: {
        email: `test-${randomUUID()}@example.com`,
        passwordHash,
        fullName: "Test User",
        status: overrides.status ?? "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function waitForBackgroundWork(): Promise<void> {
    // Password recovery deliberately returns before notification persistence.
    // CI executes every package concurrently, so 200 ms was not a reliable
    // upper bound for that real Postgres/Redis work under runner contention.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  describe("forgotPassword", () => {
    it("returns the identical generic message for an existing account", async () => {
      const user = await createUser();
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());
      expect(result.message).toMatch(/si la cuenta existe/i);
    });

    it("returns the identical generic message for an account that does not exist", async () => {
      const result = await service.forgotPassword({ email: `nobody-${randomUUID()}@example.com` }, uniqueContext());
      expect(result.message).toMatch(/si la cuenta existe/i);
    });

    it("returns byte-for-byte identical responses for an existing vs. unknown account", async () => {
      const user = await createUser();
      const existing = await service.forgotPassword({ email: user.email }, uniqueContext());
      const unknown = await service.forgotPassword({ email: `nobody-${randomUUID()}@example.com` }, uniqueContext());
      expect(existing).toEqual(unknown);
    });

    it("normalizes email case/whitespace before lookup, still queuing a real reset for the real account", async () => {
      const user = await createUser();
      await service.forgotPassword({ email: `  ${user.email.toUpperCase()}  ` }, uniqueContext());
      await waitForBackgroundWork();

      const message = mailTransport.findLastMessageTo(user.email);
      expect(message).toBeDefined();
    });

    it("creates a PasswordReset token row and queues a notification for an eligible account", async () => {
      const user = await createUser();
      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      const reset = await prisma.passwordReset.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      expect(reset).not.toBeNull();
      expect(reset?.tokenHash).toBeTruthy();

      const message = mailTransport.findLastMessageTo(user.email);
      expect(message).toBeDefined();
      expect(message?.textBody).toMatch(/token=/);

      const job = await prisma.notificationJob.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      expect(job).not.toBeNull();
      expect(job?.type).toBe("PASSWORD_RESET");
    });

    it("does not create a token or queue a notification for an unknown account", async () => {
      const email = `nobody-${randomUUID()}@example.com`;
      await service.forgotPassword({ email }, uniqueContext());
      await waitForBackgroundWork();

      expect(mailTransport.findLastMessageTo(email)).toBeUndefined();
    });

    it("does not create a token for an inactive account, but still returns the generic message", async () => {
      const user = await createUser({ status: "INACTIVE" });
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      expect(result.message).toMatch(/si la cuenta existe/i);
      expect(mailTransport.findLastMessageTo(user.email)).toBeUndefined();
    });

    it("supersedes a previous unused token when a second request is made for the same account", async () => {
      const user = await createUser();
      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();
      const firstReset = await prisma.passwordReset.findFirstOrThrow({ where: { userId: user.id } });

      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      const refreshedFirst = await prisma.passwordReset.findUniqueOrThrow({ where: { id: firstReset.id } });
      expect(refreshedFirst.supersededAt).not.toBeNull();
    });

    it("enforces IP-based rate limiting (default max 5 per window)", async () => {
      const user = await createUser();
      const context = { ipAddress: "198.51.100.77", userAgent: "rl-agent", requestId: null };

      for (let i = 0; i < 5; i++) {
        await service.forgotPassword({ email: `nobody-${randomUUID()}@example.com` }, context);
      }
      await service.forgotPassword({ email: user.email }, context);
      await waitForBackgroundWork();

      // The 6th request from the same IP is silently rate-limited - no
      // token/notification for the real account either, but the public
      // response is still the identical generic message.
      expect(mailTransport.findLastMessageTo(user.email)).toBeUndefined();
    });

    it("enforces identifier-based rate limiting independent of IP (protects one account from many IPs)", async () => {
      const user = await createUser();

      for (let i = 0; i < 3; i++) {
        await service.forgotPassword({ email: user.email }, uniqueContext());
        await waitForBackgroundWork();
      }
      mailTransport.clear();

      // A 4th request for the *same account* from a *different* IP each
      // time still trips the per-identifier limit (default max 3).
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      expect(result.message).toMatch(/si la cuenta existe/i);
      expect(mailTransport.findLastMessageTo(user.email)).toBeUndefined();
    });

    it("never persists the raw reset token anywhere - only its hash", async () => {
      const user = await createUser();
      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      const message = mailTransport.findLastMessageTo(user.email);
      const rawToken = extractTokenFromResetUrl(message!.textBody);
      const reset = await prisma.passwordReset.findFirstOrThrow({ where: { userId: user.id } });

      expect(reset.tokenHash).not.toBe(rawToken);
      expect(reset.tokenHash).not.toContain(rawToken);
    });

    it("records PASSWORD_RESET_REQUESTED and PASSWORD_RESET_TOKEN_CREATED security events", async () => {
      const user = await createUser();
      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      const events = await prisma.securityEvent.findMany({ where: { userId: user.id } });
      const types = events.map((e) => e.type);
      expect(types).toContain("PASSWORD_RESET_REQUESTED");
      expect(types).toContain("PASSWORD_RESET_TOKEN_CREATED");
    });
  });

  describe("resetPassword", () => {
    async function requestReset(user: User): Promise<string> {
      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();
      const message = mailTransport.findLastMessageTo(user.email);
      return extractTokenFromResetUrl(message!.textBody);
    }

    it("succeeds with a valid token and a strong, non-reused password", async () => {
      const user = await createUser();
      const token = await requestReset(user);

      const result = await service.resetPassword(
        { token, newPassword: "Brand-New-Strong-99!", confirmPassword: "Brand-New-Strong-99!" },
        uniqueContext(),
      );

      expect(result.message).toMatch(/restablecida/i);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await passwordService.verify(updated.passwordHash, "Brand-New-Strong-99!")).toBe(true);
      expect(updated.passwordChangedAt).not.toBeNull();
    });

    it("rejects an invalid/unknown token with a generic message", async () => {
      await expect(
        service.resetPassword(
          { token: "not-a-real-token-value-at-all-xxxxxxx", newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" },
          uniqueContext(),
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.INVALID_OR_EXPIRED_TOKEN });
    });

    it("rejects an expired token", async () => {
      const user = await createUser();
      const token = await requestReset(user);
      await prisma.passwordReset.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      await expect(
        service.resetPassword(
          { token, newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" },
          uniqueContext(),
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.INVALID_OR_EXPIRED_TOKEN });
    });

    it("rejects a token that was already used, with a distinct 'already used' code", async () => {
      const user = await createUser();
      const token = await requestReset(user);
      await service.resetPassword(
        { token, newPassword: "First-New-Strong-99!", confirmPassword: "First-New-Strong-99!" },
        uniqueContext(),
      );

      await expect(
        service.resetPassword(
          { token, newPassword: "Second-New-Strong-99!", confirmPassword: "Second-New-Strong-99!" },
          uniqueContext(),
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.TOKEN_ALREADY_USED });
    });

    it("does not let two concurrent requests both succeed with the same token", async () => {
      const user = await createUser();
      const token = await requestReset(user);

      const [first, second] = await Promise.allSettled([
        service.resetPassword({ token, newPassword: "Race-Winner-99!", confirmPassword: "Race-Winner-99!" }, uniqueContext()),
        service.resetPassword({ token, newPassword: "Race-Loser-99!", confirmPassword: "Race-Loser-99!" }, uniqueContext()),
      ]);

      const outcomes = [first.status, second.status];
      expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);
    });

    it("rejects a weak (too-short) password", async () => {
      const user = await createUser();
      const token = await requestReset(user);

      await expect(
        service.resetPassword({ token, newPassword: "short1!", confirmPassword: "short1!" }, uniqueContext()),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.WEAK_PASSWORD });
    });

    it("rejects reuse of the current password under the history policy", async () => {
      const user = await createUser();
      const token = await requestReset(user);

      await expect(
        service.resetPassword({ token, newPassword: CURRENT_PASSWORD, confirmPassword: CURRENT_PASSWORD }, uniqueContext()),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.PASSWORD_REUSED });
    });

    it("revokes every session for the user after a successful reset", async () => {
      const user = await createUser();
      const sessionA = await sessionService.createSession(user.id, uniqueContext());
      const sessionB = await sessionService.createSession(user.id, uniqueContext());
      const token = await requestReset(user);

      await service.resetPassword(
        { token, newPassword: "Post-Reset-Strong-99!", confirmPassword: "Post-Reset-Strong-99!" },
        uniqueContext(),
      );

      const [refreshedA, refreshedB] = await Promise.all([
        prisma.session.findUniqueOrThrow({ where: { id: sessionA.session.id } }),
        prisma.session.findUniqueOrThrow({ where: { id: sessionB.session.id } }),
      ]);
      expect(refreshedA.revokedAt).not.toBeNull();
      expect(refreshedA.revokedReason).toBe("PASSWORD_RESET");
      expect(refreshedB.revokedAt).not.toBeNull();
    });

    it("makes the old refresh token unusable after a successful reset (via SessionService.isUsable)", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const token = await requestReset(user);

      await service.resetPassword(
        { token, newPassword: "Post-Reset-Strong-99!", confirmPassword: "Post-Reset-Strong-99!" },
        uniqueContext(),
      );

      const found = await sessionService.findByRawRefreshToken(session.rawRefreshToken);
      expect(found).not.toBeNull();
      expect(sessionService.isUsable(found!)).toBe(false);
    });

    it("does not automatically log the user in - the response contains no tokens", async () => {
      const user = await createUser();
      const token = await requestReset(user);

      const result = await service.resetPassword(
        { token, newPassword: "No-Auto-Login-99!", confirmPassword: "No-Auto-Login-99!" },
        uniqueContext(),
      );

      expect(result).not.toHaveProperty("accessToken");
      expect(result).not.toHaveProperty("rawRefreshToken");
      expect(Object.keys(result)).toEqual(["message"]);
    });

    it("rejects an already-issued access token after reset via passwordChangedAt (US-006/US-007 integration)", async () => {
      const user = await createUser();
      const accessToken = tokenService.signAccessToken({ sub: user.id, sid: randomUUID() });
      const payloadBefore = tokenService.verifyAccessToken(accessToken);

      const token = await requestReset(user);
      await service.resetPassword(
        { token, newPassword: "Claim-Check-Strong-99!", confirmPassword: "Claim-Check-Strong-99!" },
        uniqueContext(),
      );

      const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updatedUser.passwordChangedAt).not.toBeNull();
      expect(payloadBefore.iat * 1000).toBeLessThan(updatedUser.passwordChangedAt!.getTime());
    });

    it("queues a password-changed confirmation notification after a successful reset", async () => {
      const user = await createUser();
      const token = await requestReset(user);
      mailTransport.clear();

      await service.resetPassword(
        { token, newPassword: "Confirm-Notify-Strong-99!", confirmPassword: "Confirm-Notify-Strong-99!" },
        uniqueContext(),
      );
      await waitForBackgroundWork();

      const message = mailTransport.findLastMessageTo(user.email);
      expect(message).toBeDefined();
      expect(message?.subject).toMatch(/modificada/i);
    });

    it("records PASSWORD_RESET_SUCCEEDED and PASSWORD_SESSIONS_REVOKED security events", async () => {
      const user = await createUser();
      const token = await requestReset(user);

      await service.resetPassword(
        { token, newPassword: "Events-Check-Strong-99!", confirmPassword: "Events-Check-Strong-99!" },
        uniqueContext(),
      );

      const events = await prisma.securityEvent.findMany({ where: { userId: user.id } });
      const types = events.map((e) => e.type);
      expect(types).toContain("PASSWORD_RESET_SUCCEEDED");
      expect(types).toContain("PASSWORD_SESSIONS_REVOKED");
    });
  });

  describe("changePassword", () => {
    it("succeeds for an authenticated user with the correct current password", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());

      const result = await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Changed-Strong-99!", confirmPassword: "Changed-Strong-99!" },
        uniqueContext(),
      );

      expect(result.message).toMatch(/actualizada/i);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await passwordService.verify(updated.passwordHash, "Changed-Strong-99!")).toBe(true);
    });

    it("rejects an incorrect current password with a distinct, safe code", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());

      await expect(
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: "totally-wrong-password", newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" },
          uniqueContext(),
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.CURRENT_PASSWORD_INVALID });
    });

    it("rejects a weak new password even with the correct current password", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());

      await expect(
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: CURRENT_PASSWORD, newPassword: "short1!", confirmPassword: "short1!" },
          uniqueContext(),
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.WEAK_PASSWORD });
    });

    it("rejects reuse of the current password as the new password", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());

      await expect(
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: CURRENT_PASSWORD, newPassword: CURRENT_PASSWORD, confirmPassword: CURRENT_PASSWORD },
          uniqueContext(),
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.PASSWORD_REUSED });
    });

    it("keeps the current session active but revokes every other session (documented decision)", async () => {
      const user = await createUser();
      const currentSession = await sessionService.createSession(user.id, uniqueContext());
      const otherSession = await sessionService.createSession(user.id, uniqueContext());

      await service.changePassword(
        user.id,
        currentSession.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Session-Behavior-99!", confirmPassword: "Session-Behavior-99!" },
        uniqueContext(),
      );

      const [refreshedCurrent, refreshedOther] = await Promise.all([
        prisma.session.findUniqueOrThrow({ where: { id: currentSession.session.id } }),
        prisma.session.findUniqueOrThrow({ where: { id: otherSession.session.id } }),
      ]);

      expect(refreshedCurrent.revokedAt).toBeNull(); // stays active - documented decision
      expect(refreshedOther.revokedAt).not.toBeNull();
      expect(refreshedOther.revokedReason).toBe("PASSWORD_CHANGED");
    });

    it("only counts failed current-password attempts against the rate limit, not successful ones", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const context = uniqueContext();

      // Several *successful* changes in a row must never trip the limiter,
      // since it only counts failures (US-007 section 10).
      await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Rotation-One-99!", confirmPassword: "Rotation-One-99!" },
        context,
      );
      await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: "Rotation-One-99!", newPassword: "Rotation-Two-99!", confirmPassword: "Rotation-Two-99!" },
        context,
      );

      await expect(
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: "Rotation-Two-99!", newPassword: "Rotation-Three-99!", confirmPassword: "Rotation-Three-99!" },
          context,
        ),
      ).resolves.toMatchObject({ message: expect.any(String) });
    });

    it("rate limits after enough failed current-password attempts", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const context = { ipAddress: "198.51.100.201", userAgent: "cp-agent", requestId: null };

      // CHANGE_PASSWORD_RATE_LIMIT_MAX default is 5, and the limiter's
      // `peek` (checked *before* verifying) uses the same "count > max"
      // convention as the rest of the codebase's rate limiting, so the
      // (max + 1)th attempt is the first one still let through to be
      // verified (and, if wrong, is what pushes the count to max + 1);
      // only the attempt *after* that is rejected before verification is
      // even attempted.
      for (let i = 0; i < 6; i++) {
        await expect(
          service.changePassword(
            user.id,
            session.session.id,
            { currentPassword: "wrong-password", newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" },
            context,
          ),
        ).rejects.toThrow();
      }

      await expect(
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: CURRENT_PASSWORD, newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" },
          context,
        ),
      ).rejects.toMatchObject({ code: PasswordRecoveryErrorCode.RATE_LIMITED });
    });

    it("stamps passwordChangedAt so a previously-issued access token is rejected afterward", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const accessToken = tokenService.signAccessToken({ sub: user.id, sid: session.session.id });
      const payloadBefore = tokenService.verifyAccessToken(accessToken);

      await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Claim-Check-Change-99!", confirmPassword: "Claim-Check-Change-99!" },
        uniqueContext(),
      );

      const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updatedUser.passwordChangedAt).not.toBeNull();
      expect(payloadBefore.iat * 1000).toBeLessThan(updatedUser.passwordChangedAt!.getTime());
    });

    it("queues a password-changed confirmation notification", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      mailTransport.clear();

      await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Notify-Change-99!", confirmPassword: "Notify-Change-99!" },
        uniqueContext(),
      );
      await waitForBackgroundWork();

      const message = mailTransport.findLastMessageTo(user.email);
      expect(message).toBeDefined();
    });

    it("records PASSWORD_CHANGED and PASSWORD_SESSIONS_REVOKED security events", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());

      await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Events-Change-99!", confirmPassword: "Events-Change-99!" },
        uniqueContext(),
      );

      const events = await prisma.securityEvent.findMany({ where: { userId: user.id } });
      const types = events.map((e) => e.type);
      expect(types).toContain("PASSWORD_CHANGED");
      expect(types).toContain("PASSWORD_SESSIONS_REVOKED");
    });
  });

  describe("notification failure handling", () => {
    it("marks the NotificationJob FAILED and records PASSWORD_NOTIFICATION_FAILED when the mail transport reports failure", async () => {
      const failingTransport: MailTransport = {
        send: () => Promise.resolve({ delivered: false, failureReason: "SMTP_NOT_CONFIGURED" }),
      };

      const isolatedModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
          JwtModule.register({}),
          PrismaModule,
          RedisModule,
          SecurityEventsModule,
          NotificationsModule,
        ],
        providers: [
          PasswordRecoveryService,
          PasswordService,
          PasswordPolicyService,
          PasswordResetTokenService,
          SessionService,
          TokenService,
          RateLimiterService,
        ],
      })
        .overrideProvider(MAIL_TRANSPORT)
        .useValue(failingTransport)
        .compile();

      const isolatedService = isolatedModule.get(PasswordRecoveryService);
      const prismaLocal = isolatedModule.get(PrismaService);
      const passwordServiceLocal = isolatedModule.get(PasswordService);

      const user = await prismaLocal.user.create({
        data: {
          email: `test-${randomUUID()}@example.com`,
          passwordHash: await passwordServiceLocal.hash(CURRENT_PASSWORD),
          fullName: "Test User",
          status: "ACTIVE",
        },
      });

      await isolatedService.forgotPassword(
        { email: user.email },
        { ipAddress: "203.0.113.222", userAgent: "a", requestId: randomUUID() },
      );
      await new Promise((resolve) => setTimeout(resolve, 200));

      const job = await prismaLocal.notificationJob.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      expect(job?.status).toBe("FAILED");
      expect(job?.failureReason).toBe("SMTP_NOT_CONFIGURED");

      const event = await prismaLocal.securityEvent.findFirst({
        where: { userId: user.id, type: "PASSWORD_NOTIFICATION_FAILED" },
      });
      expect(event).not.toBeNull();

      await prismaLocal.user.delete({ where: { id: user.id } });
      await isolatedModule.close();
    });
  });

  describe("secret redaction across the whole flow", () => {
    it("never persists a plaintext new password anywhere reachable via Prisma", async () => {
      const user = await createUser();
      const distinctiveNewPassword = `secret-marker-${randomUUID()}-99!`;
      const session = await sessionService.createSession(user.id, uniqueContext());

      await service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: distinctiveNewPassword, confirmPassword: distinctiveNewPassword },
        uniqueContext(),
      );

      const [updatedUser, history, events] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        prisma.passwordHistoryEntry.findMany({ where: { userId: user.id } }),
        prisma.securityEvent.findMany({ where: { userId: user.id } }),
      ]);

      expect(updatedUser.passwordHash).not.toContain(distinctiveNewPassword);
      expect(JSON.stringify(history)).not.toContain(distinctiveNewPassword);
      expect(JSON.stringify(events)).not.toContain(distinctiveNewPassword);
    });
  });
});
