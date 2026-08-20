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
import { SecurityEventService } from "../../common/security-events/security-event.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { NotificationService } from "../notifications/notification.service";
import { InMemoryMailTransport } from "../notifications/in-memory-mail.transport";
import { MAIL_TRANSPORT, type MailTransport } from "../notifications/mail-transport.interface";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { RedisModule } from "../../common/redis/redis.module";
import { RedisService } from "../../common/redis/redis.service";
import { validateEnv } from "../../config/env.validation";
import { AdminIdentityPolicy } from "./admin-identity.policy";

const CURRENT_PASSWORD = "Current-Password-99!";
const PRIVILEGED_TEST_EMAIL = `admin-${randomUUID()}@example.invalid`;
const RECOVERY_TEST_EMAIL = `recovery-${randomUUID()}@example.invalid`;

function extractTokenFromResetUrl(body: string): string {
  const match = /token=([^&\s]+)/.exec(body);
  if (!match) throw new Error("no reset token found in captured email body");
  return decodeURIComponent(match[1]!);
}

describe("PasswordRecoveryService (integration, real Postgres + Redis, no mocking of business logic)", () => {
  const originalAdminAccountEmail = process.env.ADMIN_ACCOUNT_EMAIL;
  const originalAdminRecoveryEmail = process.env.ADMIN_RECOVERY_EMAIL;
  let moduleRef: TestingModule;
  let service: PasswordRecoveryService;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let passwordResetTokenService: PasswordResetTokenService;
  let sessionService: SessionService;
  let tokenService: TokenService;
  let mailTransport: InMemoryMailTransport;
  let notificationService: NotificationService;
  let securityEventService: SecurityEventService;
  let rateLimiterService: RateLimiterService;
  let redisService: RedisService;
  const createdUserIds: string[] = [];
  let ipCounter = 0;

  beforeAll(async () => {
    process.env.ADMIN_ACCOUNT_EMAIL = PRIVILEGED_TEST_EMAIL;
    process.env.ADMIN_RECOVERY_EMAIL = RECOVERY_TEST_EMAIL;
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
        AdminIdentityPolicy,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    service = moduleRef.get(PasswordRecoveryService);
    prisma = moduleRef.get(PrismaService);
    passwordService = moduleRef.get(PasswordService);
    passwordResetTokenService = moduleRef.get(PasswordResetTokenService);
    sessionService = moduleRef.get(SessionService);
    tokenService = moduleRef.get(TokenService);
    mailTransport = moduleRef.get(InMemoryMailTransport);
    notificationService = moduleRef.get(NotificationService);
    securityEventService = moduleRef.get(SecurityEventService);
    rateLimiterService = moduleRef.get(RateLimiterService);
    redisService = moduleRef.get(RedisService);

    // Redis rate-limit counters intentionally outlive a Jest process. Clear
    // only this suite's forgot-password keys so repeated focused runs cannot
    // silently rate-limit the fixed privileged identity used by these tests.
    const redisClient = redisService.getClient();
    const forgotPasswordKeys = await redisClient.keys("ratelimit:forgot-password:*");
    if (forgotPasswordKeys.length > 0) {
      await redisClient.del(...forgotPasswordKeys);
    }
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
    if (originalAdminAccountEmail === undefined) delete process.env.ADMIN_ACCOUNT_EMAIL;
    else process.env.ADMIN_ACCOUNT_EMAIL = originalAdminAccountEmail;
    if (originalAdminRecoveryEmail === undefined) delete process.env.ADMIN_RECOVERY_EMAIL;
    else process.env.ADMIN_RECOVERY_EMAIL = originalAdminRecoveryEmail;
  });

  afterEach(async () => {
    mailTransport.clear();
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.splice(0, createdUserIds.length);
    }
  });

  function uniqueContext() {
    ipCounter += 1;
    return { ipAddress: `203.0.113.${100 + ipCounter}`, userAgent: "jest-integration-agent", requestId: randomUUID() };
  }

  async function createUser(overrides: Partial<User> = {}): Promise<User> {
    const passwordHash = overrides.passwordHash ?? (await passwordService.hash(CURRENT_PASSWORD));
    const user = await prisma.user.create({
      data: {
        email: overrides.email ?? `test-${randomUUID()}@example.com`,
        recoveryEmail: overrides.recoveryEmail,
        passwordHash,
        fullName: overrides.fullName ?? "Test User",
        status: overrides.status ?? "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function waitForBackgroundWork(): Promise<void> {
    // Password recovery queues outside the public response path. The durable
    // outbox intentionally does not auto-run in NODE_ENV=test, so tests drive
    // the real claim/delivery worker explicitly instead of relying on a timer.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await notificationService.processAvailableJobs();
  }

  describe("forgotPassword", () => {
    it("returns the identical generic message for an existing account", async () => {
      const user = await createUser();
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());
      expect(result.message).toMatch(/si la cuenta existe/i);
    });

    it("sends privileged recovery to the configured recovery-only address, never the admin login address", async () => {
      const user = await createUser({
        email: PRIVILEGED_TEST_EMAIL,
        recoveryEmail: RECOVERY_TEST_EMAIL,
      });
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      expect(result.message).toMatch(/si la cuenta existe/i);
      const message = mailTransport.sentMessages.find((entry) =>
        entry.to === RECOVERY_TEST_EMAIL && entry.subject.includes("Restablece"));
      expect(message?.to).toBe(RECOVERY_TEST_EMAIL);
      expect(message?.to).not.toBe(PRIVILEGED_TEST_EMAIL);
    });

    it("fails privileged recovery closed on a missing channel and records a security event without revealing the destination", async () => {
      const user = await createUser({ email: PRIVILEGED_TEST_EMAIL, recoveryEmail: null });
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      expect(result.message).toMatch(/si la cuenta existe/i);
      expect(await prisma.passwordReset.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.securityEvent.findFirst({
        where: { userId: user.id, type: "PASSWORD_RESET_FAILED" },
      })).toMatchObject({ metadata: { reason: "PRIVILEGED_RECOVERY_CONFIGURATION_INVALID" } });
      expect(mailTransport.sentMessages.some((entry) => entry.subject.includes("Configuración de recuperación"))).toBe(true);
    });

    it("fails privileged recovery closed when the persisted channel mismatches configuration", async () => {
      const user = await createUser({ email: PRIVILEGED_TEST_EMAIL, recoveryEmail: "unexpected@example.com" });
      await service.forgotPassword({ email: user.email }, uniqueContext());
      await waitForBackgroundWork();

      expect(await prisma.passwordReset.count({ where: { userId: user.id } })).toBe(0);
      expect(mailTransport.sentMessages.some((entry) => entry.to === "unexpected@example.com")).toBe(false);
    });

    it("fails privileged recovery closed when Redis cannot enforce its limits without changing the public response", async () => {
      const user = await createUser({ email: PRIVILEGED_TEST_EMAIL, recoveryEmail: RECOVERY_TEST_EMAIL });
      const strictLimit = jest.spyOn(rateLimiterService, "checkAndIncrementStrict")
        .mockRejectedValue(new Error("injected Redis outage with sensitive details"));

      const privilegedResponse = await (async () => {
        try {
          return await service.forgotPassword({ email: user.email }, uniqueContext());
        } finally {
          strictLimit.mockRestore();
        }
      })();
      const unknownResponse = await service.forgotPassword(
        { email: `nobody-${randomUUID()}@example.com` },
        uniqueContext(),
      );

      expect(privilegedResponse).toEqual(unknownResponse);
      expect(await prisma.passwordReset.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.notificationJob.count({ where: { userId: user.id, type: "PASSWORD_RESET" } })).toBe(0);
    });

    it("preserves the configured privileged request maximum and blocks only the following request", async () => {
      const user = await createUser({ email: PRIVILEGED_TEST_EMAIL, recoveryEmail: RECOVERY_TEST_EMAIL });
      const existingKeys = await redisService.getClient().keys("ratelimit:forgot-password:*");
      if (existingKeys.length > 0) await redisService.getClient().del(...existingKeys);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await service.forgotPassword({ email: user.email }, uniqueContext());
      }

      expect(await prisma.passwordReset.count({ where: { userId: user.id } })).toBe(3);
      expect(await prisma.notificationJob.count({ where: { userId: user.id, type: "PASSWORD_RESET" } })).toBe(3);
      expect(await prisma.passwordReset.count({
        where: { userId: user.id, usedAt: null, supersededAt: null, expiresAt: { gt: new Date() } },
      })).toBe(1);
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

    it("applies the same bounded response floor to existing and unknown identities", async () => {
      const user = await createUser();
      const existingStartedAt = Date.now();
      await service.forgotPassword({ email: user.email }, uniqueContext());
      const existingDuration = Date.now() - existingStartedAt;
      const unknownStartedAt = Date.now();
      await service.forgotPassword({ email: `nobody-${randomUUID()}@example.com` }, uniqueContext());
      const unknownDuration = Date.now() - unknownStartedAt;

      // Leave scheduler tolerance while proving neither path returns at the
      // raw indexed-lookup speed that would reveal account existence.
      expect(existingDuration).toBeGreaterThanOrEqual(225);
      expect(unknownDuration).toBeGreaterThanOrEqual(225);
    });

    it("normalizes email case/whitespace before lookup, still queuing a real reset for the real account", async () => {
      const user = await createUser();
      await service.forgotPassword({ email: `  ${user.email.toUpperCase()}  ` }, uniqueContext());
      await waitForBackgroundWork();

      const message = mailTransport.findLastMessageTo(user.email);
      expect(message).toBeDefined();
    });

    it("resolves the recipient from the locked current row, never a stale pre-transaction identity snapshot", async () => {
      const staleUser = await createUser();
      const currentEmail = `current-${randomUUID()}@example.com`;
      await prisma.user.update({ where: { id: staleUser.id }, data: { email: currentEmail } });

      await (service as unknown as {
        processForgotPassword(user: User, context: ReturnType<typeof uniqueContext>): Promise<void>;
      }).processForgotPassword(staleUser, uniqueContext());
      await waitForBackgroundWork();

      expect(mailTransport.findLastMessageTo(staleUser.email)).toBeUndefined();
      expect(mailTransport.findLastMessageTo(currentEmail)).toBeDefined();
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

    it("durably persists the reset token and outbox job before forgotPassword resolves", async () => {
      const user = await createUser();
      const result = await service.forgotPassword({ email: user.email }, uniqueContext());

      expect(result.message).toMatch(/si la cuenta existe/i);
      expect(await prisma.passwordReset.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.notificationJob.count({ where: { userId: user.id, type: "PASSWORD_RESET" } })).toBe(1);
      expect(await prisma.securityEvent.count({
        where: {
          userId: user.id,
          type: { in: ["PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_TOKEN_CREATED"] },
        },
      })).toBe(2);
    });

    it("keeps the prior token usable when the required outbox enqueue aborts the recovery transaction", async () => {
      const user = await createUser();
      const context = uniqueContext();
      const first = await passwordResetTokenService.createToken(user.id, context);
      const requiredEnqueue = jest.spyOn(notificationService, "queuePasswordResetEmailRequired")
        .mockRejectedValueOnce(new Error("injected outbox failure"));

      const result = await service.forgotPassword({ email: user.email }, context);
      requiredEnqueue.mockRestore();

      expect(result.message).toMatch(/si la cuenta existe/i);
      const [resets, events, jobs] = await Promise.all([
        prisma.passwordReset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
        prisma.securityEvent.findMany({ where: { userId: user.id, requestId: context.requestId } }),
        prisma.notificationJob.findMany({ where: { userId: user.id, correlationId: context.requestId } }),
      ]);
      expect(resets).toHaveLength(1);
      expect(resets[0]?.id).toBe(first.passwordReset.id);
      expect(resets[0]?.supersededAt).toBeNull();
      expect(events).toHaveLength(0);
      expect(jobs).toHaveLength(0);
    });

    it("rolls token supersession/creation and mandatory events back when PostgreSQL rejects the outbox row", async () => {
      const user = await createUser();
      const context = uniqueContext();
      const first = await passwordResetTokenService.createToken(user.id, context);
      const rawToken = passwordResetTokenService.generateToken();

      // The nonexistent notification user produces a real PostgreSQL FK
      // failure after the preceding token/event writes. This proves the
      // transaction boundary itself rather than mocking Prisma success.
      await expect(prisma.$transaction(async (tx) => {
        await securityEventService.recordRequired(tx, {
          type: "PASSWORD_RESET_REQUESTED",
          userId: user.id,
          requestId: context.requestId,
        });
        const passwordReset = await passwordResetTokenService.createTokenFromRaw(user.id, context, rawToken, tx);
        await securityEventService.recordRequired(tx, {
          type: "PASSWORD_RESET_TOKEN_CREATED",
          userId: user.id,
          requestId: context.requestId,
          metadata: { passwordResetId: passwordReset.id },
        });
        await notificationService.queuePasswordResetEmailRequired(tx, {
          recipientEmail: user.email,
          userId: randomUUID(),
          resetUrl: `https://example.test/restablecer-clave?token=${rawToken}`,
          correlationId: context.requestId,
        });
      })).rejects.toBeDefined();

      const [resets, events, jobs] = await Promise.all([
        prisma.passwordReset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
        prisma.securityEvent.findMany({ where: { userId: user.id, requestId: context.requestId } }),
        prisma.notificationJob.findMany({ where: { correlationId: context.requestId } }),
      ]);
      expect(resets).toHaveLength(1);
      expect(resets[0]?.id).toBe(first.passwordReset.id);
      expect(resets[0]?.supersededAt).toBeNull();
      expect(events).toHaveLength(0);
      expect(jobs).toHaveLength(0);
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

    it("serializes concurrent recovery issuance so at most one token remains active", async () => {
      const user = await createUser();
      const firstContext = uniqueContext();
      const secondContext = uniqueContext();

      await Promise.all([
        service.forgotPassword({ email: user.email }, firstContext),
        service.forgotPassword({ email: user.email }, secondContext),
      ]);

      const [resets, activeResets, jobs, events] = await Promise.all([
        prisma.passwordReset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
        prisma.passwordReset.findMany({
          where: {
            userId: user.id,
            usedAt: null,
            supersededAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
        prisma.notificationJob.findMany({
          where: {
            userId: user.id,
            type: "PASSWORD_RESET",
            correlationId: { in: [firstContext.requestId, secondContext.requestId] },
          },
        }),
        prisma.securityEvent.findMany({
          where: {
            userId: user.id,
            requestId: { in: [firstContext.requestId, secondContext.requestId] },
            type: { in: ["PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_TOKEN_CREATED"] },
          },
        }),
      ]);

      // Both committed recovery commands retain their durable evidence, but
      // the later serialized request supersedes the earlier token before it
      // inserts its own. There is never more than one usable bearer token.
      expect(resets).toHaveLength(2);
      expect(activeResets).toHaveLength(1);
      expect(resets.filter((reset) => reset.supersededAt !== null)).toHaveLength(1);
      expect(jobs).toHaveLength(2);
      expect(events).toHaveLength(4);
    });

    it("rolls one concurrent issuance back without suppressing the other committed token", async () => {
      const user = await createUser();
      const firstContext = uniqueContext();
      const secondContext = uniqueContext();
      const requiredEnqueue = jest.spyOn(notificationService, "queuePasswordResetEmailRequired")
        .mockRejectedValueOnce(new Error("injected concurrent outbox failure"));

      try {
        await Promise.all([
          service.forgotPassword({ email: user.email }, firstContext),
          service.forgotPassword({ email: user.email }, secondContext),
        ]);
      } finally {
        requiredEnqueue.mockRestore();
      }

      const [resets, jobs, events] = await Promise.all([
        prisma.passwordReset.findMany({
          where: {
            userId: user.id,
            usedAt: null,
            supersededAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
        prisma.notificationJob.findMany({
          where: {
            userId: user.id,
            type: "PASSWORD_RESET",
            correlationId: { in: [firstContext.requestId, secondContext.requestId] },
          },
        }),
        prisma.securityEvent.findMany({
          where: {
            userId: user.id,
            requestId: { in: [firstContext.requestId, secondContext.requestId] },
            type: { in: ["PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_TOKEN_CREATED"] },
          },
        }),
      ]);

      // The failed transaction leaves no partial event, token or outbox row;
      // after PostgreSQL releases its row lock, the competing request commits
      // one complete recovery command and exactly one usable token.
      expect(resets).toHaveLength(1);
      expect(jobs).toHaveLength(1);
      expect(events).toHaveLength(2);
      expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
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

      const [reset, historyCount, successCount] = await Promise.all([
        prisma.passwordReset.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
        prisma.passwordHistoryEntry.count({ where: { userId: user.id } }),
        prisma.securityEvent.count({ where: { userId: user.id, type: "PASSWORD_RESET_SUCCEEDED" } }),
      ]);
      expect(reset.usedAt).not.toBeNull();
      expect(historyCount).toBe(1);
      expect(successCount).toBe(1);
    });

    it("rolls token claim, password, sessions and required events back when a required event insert fails", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const token = await requestReset(user);
      const requiredEvent = jest.spyOn(securityEventService, "recordRequired");
      requiredEvent.mockImplementationOnce(async () => undefined);
      requiredEvent.mockRejectedValueOnce(new Error("injected required event failure"));

      await expect(
        service.resetPassword(
          { token, newPassword: "Rollback-Reset-99!", confirmPassword: "Rollback-Reset-99!" },
          uniqueContext(),
        ),
      ).rejects.toThrow("injected required event failure");
      requiredEvent.mockRestore();

      const [reset, refreshedUser, refreshedSession, historyCount, successCount] = await Promise.all([
        prisma.passwordReset.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        prisma.session.findUniqueOrThrow({ where: { id: session.session.id } }),
        prisma.passwordHistoryEntry.count({ where: { userId: user.id } }),
        prisma.securityEvent.count({ where: { userId: user.id, type: "PASSWORD_RESET_SUCCEEDED" } }),
      ]);
      expect(reset.usedAt).toBeNull();
      expect(refreshedUser.passwordHash).toBe(user.passwordHash);
      expect(refreshedSession.revokedAt).toBeNull();
      expect(historyCount).toBe(0);
      expect(successCount).toBe(0);
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

    it("allows only one concurrent password change from the same prior hash", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const [first, second] = await Promise.allSettled([
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: CURRENT_PASSWORD, newPassword: "Concurrent-One-99!", confirmPassword: "Concurrent-One-99!" },
          uniqueContext(),
        ),
        service.changePassword(
          user.id,
          session.session.id,
          { currentPassword: CURRENT_PASSWORD, newPassword: "Concurrent-Two-99!", confirmPassword: "Concurrent-Two-99!" },
          uniqueContext(),
        ),
      ]);

      expect([first, second].filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect([first, second].filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(await prisma.passwordHistoryEntry.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.securityEvent.count({ where: { userId: user.id, type: "PASSWORD_CHANGED" } })).toBe(1);
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

    it("rolls password, session revocation, history and events back when a required event insert fails", async () => {
      const user = await createUser();
      const currentSession = await sessionService.createSession(user.id, uniqueContext());
      const otherSession = await sessionService.createSession(user.id, uniqueContext());
      const requiredEvent = jest.spyOn(securityEventService, "recordRequired")
        .mockRejectedValueOnce(new Error("injected required event failure"));

      await expect(
        service.changePassword(
          user.id,
          currentSession.session.id,
          { currentPassword: CURRENT_PASSWORD, newPassword: "Rollback-Change-99!", confirmPassword: "Rollback-Change-99!" },
          uniqueContext(),
        ),
      ).rejects.toThrow("injected required event failure");
      requiredEvent.mockRestore();

      const [refreshedUser, refreshedOther, historyCount, eventCount] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        prisma.session.findUniqueOrThrow({ where: { id: otherSession.session.id } }),
        prisma.passwordHistoryEntry.count({ where: { userId: user.id } }),
        prisma.securityEvent.count({ where: { userId: user.id, type: "PASSWORD_CHANGED" } }),
      ]);
      expect(refreshedUser.passwordHash).toBe(user.passwordHash);
      expect(refreshedOther.revokedAt).toBeNull();
      expect(historyCount).toBe(0);
      expect(eventCount).toBe(0);
    });

    it("keeps a committed password change when confirmation enqueue fails and records an operational event", async () => {
      const user = await createUser();
      const session = await sessionService.createSession(user.id, uniqueContext());
      const queueConfirmation = jest.spyOn(notificationService, "queuePasswordChangedEmail")
        .mockRejectedValueOnce(new Error("injected queue failure"));
      const queueAlert = jest.spyOn(notificationService, "queueSecurityAlert").mockResolvedValueOnce(undefined as never);

      await expect(service.changePassword(
        user.id,
        session.session.id,
        { currentPassword: CURRENT_PASSWORD, newPassword: "Committed-Despite-Notify-99!", confirmPassword: "Committed-Despite-Notify-99!" },
        uniqueContext(),
      )).resolves.toMatchObject({ message: expect.any(String) });
      expect(queueAlert).toHaveBeenCalledWith(expect.objectContaining({
        recipientEmail: RECOVERY_TEST_EMAIL,
        userId: user.id,
      }));
      queueConfirmation.mockRestore();
      queueAlert.mockRestore();

      const [refreshedUser, failureEvent] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
        prisma.securityEvent.findFirst({ where: { userId: user.id, type: "PASSWORD_NOTIFICATION_FAILED" } }),
      ]);
      expect(await passwordService.verify(refreshedUser.passwordHash, "Committed-Despite-Notify-99!")).toBe(true);
      expect(failureEvent?.metadata).toMatchObject({ reason: "PASSWORD_CHANGED_NOTIFICATION_QUEUE_FAILED" });
    });
  });

  describe("notification failure handling", () => {
    it("schedules a retry and records PASSWORD_NOTIFICATION_FAILED when the first delivery attempt fails", async () => {
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
          AdminIdentityPolicy,
        ],
      })
        .overrideProvider(MAIL_TRANSPORT)
        .useValue(failingTransport)
        .compile();

      const isolatedService = isolatedModule.get(PasswordRecoveryService);
      const prismaLocal = isolatedModule.get(PrismaService);
      const passwordServiceLocal = isolatedModule.get(PasswordService);
      const notificationServiceLocal = isolatedModule.get(NotificationService);

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
      await new Promise((resolve) => setTimeout(resolve, 50));
      await notificationServiceLocal.processAvailableJobs();

      const job = await prismaLocal.notificationJob.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
      expect(job?.status).toBe("RETRY_PENDING");
      expect(job?.retryCount).toBe(1);
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
