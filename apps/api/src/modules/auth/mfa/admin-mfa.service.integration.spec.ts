import { randomUUID } from "node:crypto";
import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { Secret, TOTP } from "otpauth";
import { PrismaModule } from "../../../database/prisma.module";
import { PrismaService } from "../../../database/prisma.service";
import { SecurityEventsModule } from "../../../common/security-events/security-events.module";
import { SecurityEventService } from "../../../common/security-events/security-event.service";
import { RedisModule } from "../../../common/redis/redis.module";
import { RedisService } from "../../../common/redis/redis.service";
import { validateEnv } from "../../../config/env.validation";
import { AdminIdentityPolicy } from "../admin-identity.policy";
import { PasswordService } from "../password.service";
import { RateLimiterService } from "../rate-limiter.service";
import { AdminMfaService } from "./admin-mfa.service";
import { MfaSecretProtectorService } from "./mfa-secret-protector.service";

const PASSWORD = "Mfa-Integration-Password-99!";

describe("AdminMfaService (integration)", () => {
  let moduleRef: TestingModule;
  let service: AdminMfaService;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let securityEventService: SecurityEventService;
  let redisService: RedisService;
  let adminUserId: string;
  let adminSessionId: string;

  const context = () => ({ ipAddress: "203.0.113.201", userAgent: "mfa-jest", requestId: randomUUID() });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        PrismaModule,
        RedisModule,
        SecurityEventsModule,
      ],
      providers: [AdminMfaService, MfaSecretProtectorService, AdminIdentityPolicy, PasswordService, RateLimiterService],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    service = moduleRef.get(AdminMfaService);
    prisma = moduleRef.get(PrismaService);
    passwordService = moduleRef.get(PasswordService);
    securityEventService = moduleRef.get(SecurityEventService);
    redisService = moduleRef.get(RedisService);
  });

  beforeEach(async () => {
    const redis = moduleRef.get(RedisService).getClient();
    const keys = await redis.keys("ratelimit:admin-*:*");
    if (keys.length > 0) await redis.del(...keys);
    await prisma.user.deleteMany({ where: { email: "admin@asodef.com.co" } });
    const user = await prisma.user.create({
      data: {
        email: "admin@asodef.com.co",
        recoveryEmail: "asodefsas@gmail.com",
        passwordHash: await passwordService.hash(PASSWORD),
        fullName: "MFA Test Administrator",
      },
    });
    adminUserId = user.id;
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    adminSessionId = session.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: adminUserId } });
  });

  afterAll(async () => moduleRef.close());

  async function enroll() {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const token = generateCode(started.secret);
    const confirmed = await service.confirmEnrollment(adminUserId, adminSessionId, PASSWORD, token, context());
    return { started, confirmed };
  }

  function nextStepCode(secret: string): string {
    return generateCode(secret, Date.now() + 30_000);
  }

  function completeChallenge(token: string, code: string) {
    return service.completeLoginChallenge(token, code, context(), async (_tx, user) => user);
  }

  it("keeps enforcement staged off by default and exposes the seed only during pending enrollment", async () => {
    expect((await service.getStatus(adminUserId)).required).toBe(false);
    const { started, confirmed } = await enroll();
    const stored = await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } });
    expect(stored.secretEncrypted).not.toContain(started.secret);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(await service.getStatus(adminUserId)).toMatchObject({ enrolled: true, status: "ACTIVE", recoveryCodesRemaining: 10 });
    await expect(service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context()))
      .rejects.toMatchObject({ code: "MFA_ALREADY_ENABLED" });
  });

  it("requires the current password and a live session before exposing an enrollment secret", async () => {
    await expect(service.beginEnrollment(adminUserId, adminSessionId, "wrong-password-value", context()))
      .rejects.toMatchObject({ code: "MFA_PASSWORD_INVALID" });
    expect(await prisma.adminMfaCredential.findUnique({ where: { userId: adminUserId } })).toBeNull();
    expect(await prisma.session.findUniqueOrThrow({ where: { id: adminSessionId } }))
      .toMatchObject({ recentAuthenticationAt: null });

    await prisma.session.update({
      where: { id: adminSessionId },
      data: { revokedAt: new Date(), revokedReason: "ADMIN_ACTION" },
    });
    await expect(service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context()))
      .rejects.toMatchObject({ code: "MFA_CONFLICT" });
  });

  it("revalidates the current password on confirmation and records recent authentication", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const afterBegin = await prisma.session.findUniqueOrThrow({ where: { id: adminSessionId } });
    expect(afterBegin.recentAuthenticationAt).toBeInstanceOf(Date);

    await expect(service.confirmEnrollment(
      adminUserId,
      adminSessionId,
      "wrong-password-value",
      generateCode(started.secret),
      context(),
    )).rejects.toMatchObject({ code: "MFA_PASSWORD_INVALID" });
    expect(await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } }))
      .toMatchObject({ status: "PENDING" });

    await expect(service.confirmEnrollment(
      adminUserId,
      adminSessionId,
      PASSWORD,
      generateCode(started.secret),
      context(),
    )).resolves.toMatchObject({ recoveryCodes: expect.any(Array) });
    const afterConfirm = await prisma.session.findUniqueOrThrow({ where: { id: adminSessionId } });
    expect(afterConfirm.recentAuthenticationAt!.getTime()).toBeGreaterThanOrEqual(afterBegin.recentAuthenticationAt!.getTime());
  });

  it("bounds invalid confirmation attempts for one pending secret", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const requestContext = { ipAddress: "203.0.113.252", userAgent: "enrollment-limit-test", requestId: randomUUID() };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.confirmEnrollment(
        adminUserId,
        adminSessionId,
        PASSWORD,
        "invalid",
        requestContext,
      )).rejects.toMatchObject({ code: "MFA_INVALID_CODE" });
    }
    await expect(service.confirmEnrollment(
      adminUserId,
      adminSessionId,
      PASSWORD,
      generateCode(started.secret),
      requestContext,
    )).rejects.toMatchObject({ code: "MFA_ATTEMPTS_EXCEEDED" });
  });

  it("fails enrollment closed when the strict Redis limiter is unavailable", async () => {
    const unavailable = jest.spyOn(redisService, "getClient").mockImplementation(() => {
      throw new Error("redis unavailable");
    });
    try {
      await expect(service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context()))
        .rejects.toMatchObject({ code: "MFA_NOT_AVAILABLE" });
    } finally {
      unavailable.mockRestore();
    }
    expect(await prisma.adminMfaCredential.findUnique({ where: { userId: adminUserId } })).toBeNull();
  });

  it("rejects enrollment if the official administrator becomes inactive", async () => {
    await prisma.user.update({ where: { id: adminUserId }, data: { status: "INACTIVE" } });
    await expect(service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context()))
      .rejects.toMatchObject({ code: "MFA_ADMIN_ONLY" });
  });

  it("atomically consumes a login challenge exactly once", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challenge = await service.createLoginChallenge(user, context());
    const code = nextStepCode(started.secret);
    const results = await Promise.allSettled([
      completeChallenge(challenge.challengeToken, code),
      completeChallenge(challenge.challengeToken, code),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("blocks reuse of the same TOTP counter across separate challenges", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const first = await service.createLoginChallenge(user, context());
    const second = await service.createLoginChallenge(user, context());
    const code = nextStepCode(started.secret);
    await expect(completeChallenge(first.challengeToken, code)).resolves.toMatchObject({ id: adminUserId });
    await expect(completeChallenge(second.challengeToken, code)).rejects.toMatchObject({ code: "MFA_INVALID_CODE" });
  });

  it("aggregates failed MFA guesses across multiple challenges for the official administrator", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const first = await service.createLoginChallenge(user, context());
    const second = await service.createLoginChallenge(user, context());
    const challenges = [first.challengeToken, second.challengeToken];
    const activeWindowCodes = new Set([
      generateCode(started.secret, Date.now() - 30_000),
      generateCode(started.secret),
      generateCode(started.secret, Date.now() + 30_000),
    ]);
    const invalidCode = ["000000", "000001", "000002", "000003"]
      .find((candidate) => !activeWindowCodes.has(candidate))!;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(completeChallenge(challenges[attempt % challenges.length]!, invalidCode))
        .rejects.toMatchObject({ code: "MFA_INVALID_CODE" });
    }
    await expect(completeChallenge(second.challengeToken, nextStepCode(started.secret)))
      .rejects.toMatchObject({ code: "MFA_ATTEMPTS_EXCEEDED" });
  });

  it("fails challenge issuance closed when the strict Redis limiter is unavailable", async () => {
    await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challengeCountBefore = await prisma.adminMfaLoginChallenge.count({ where: { userId: adminUserId } });
    const unavailable = jest.spyOn(redisService, "getClient").mockImplementation(() => {
      throw new Error("redis unavailable");
    });
    try {
      await expect(service.createLoginChallenge(user, context()))
        .rejects.toMatchObject({ code: "MFA_NOT_AVAILABLE" });
    } finally {
      unavailable.mockRestore();
    }
    expect(await prisma.adminMfaLoginChallenge.count({ where: { userId: adminUserId } }))
      .toBe(challengeCountBefore);
  });

  it("fails verification closed during a Redis outage without consuming the challenge or factor", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challenge = await service.createLoginChallenge(user, context());
    const code = nextStepCode(started.secret);
    const unavailable = jest.spyOn(redisService, "getClient").mockImplementation(() => {
      throw new Error("redis unavailable");
    });
    try {
      await expect(completeChallenge(challenge.challengeToken, code))
        .rejects.toMatchObject({ code: "MFA_NOT_AVAILABLE" });
    } finally {
      unavailable.mockRestore();
    }
    expect(await prisma.adminMfaLoginChallenge.findFirstOrThrow({
      where: { userId: adminUserId },
      orderBy: { createdAt: "desc" },
    }))
      .toMatchObject({ usedAt: null, attemptCount: 0 });
    await expect(completeChallenge(challenge.challengeToken, code)).resolves.toMatchObject({ id: adminUserId });
  });

  it("consumes one recovery code only once even under concurrent challenges", async () => {
    const { confirmed } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const first = await service.createLoginChallenge(user, context());
    const second = await service.createLoginChallenge(user, context());
    const code = confirmed.recoveryCodes[0]!;
    const results = await Promise.allSettled([
      completeChallenge(first.challengeToken, code),
      completeChallenge(second.challengeToken, code),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("requires an active credential before issuing a login challenge", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    await expect(service.createLoginChallenge(user, context())).rejects.toMatchObject({ code: "MFA_ENROLLMENT_REQUIRED" });
  });

  it("does not issue a challenge after a concurrent password change invalidates the first factor", async () => {
    await enroll();
    const staleUser = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    await prisma.user.update({
      where: { id: adminUserId },
      data: {
        passwordHash: await passwordService.hash("A-New-Administrative-Password-99!"),
        passwordChangedAt: new Date(),
      },
    });
    const before = await prisma.adminMfaLoginChallenge.count({ where: { userId: adminUserId } });
    await expect(service.createLoginChallenge(staleUser, context()))
      .rejects.toMatchObject({ code: "MFA_CHALLENGE_INVALID" });
    expect(await prisma.adminMfaLoginChallenge.count({ where: { userId: adminUserId } })).toBe(before);
  });

  it("consumes the enrollment TOTP counter and rejects immediate same-step reuse", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const sameStepCode = generateCode(started.secret);
    await service.confirmEnrollment(adminUserId, adminSessionId, PASSWORD, sameStepCode, context());
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challenge = await service.createLoginChallenge(user, context());
    await expect(completeChallenge(challenge.challengeToken, sameStepCode))
      .rejects.toMatchObject({ code: "MFA_INVALID_CODE" });
  });

  it("allows only one concurrent confirmation to activate a pending enrollment", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const code = generateCode(started.secret);
    const results = await Promise.allSettled([
      service.confirmEnrollment(adminUserId, adminSessionId, PASSWORD, code, context()),
      service.confirmEnrollment(adminUserId, adminSessionId, PASSWORD, code, context()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.adminMfaRecoveryCode.count({ where: { credential: { userId: adminUserId } } })).toBe(10);
  });

  it("never degrades an ACTIVE credential when confirmation wins against a stale begin", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const originalFindUnique = prisma.adminMfaCredential.findUnique.bind(prisma.adminMfaCredential);
    let releaseStaleRead!: () => void;
    let markStaleRead!: () => void;
    const staleReadReached = new Promise<void>((resolve) => { markStaleRead = resolve; });
    const staleReadRelease = new Promise<void>((resolve) => { releaseStaleRead = resolve; });
    let interceptNextUserLookup = true;
    const staleReadImplementation = async (args: Parameters<typeof originalFindUnique>[0]) => {
      const result = await originalFindUnique(args);
      if (interceptNextUserLookup && "userId" in args.where) {
        interceptNextUserLookup = false;
        markStaleRead();
        await staleReadRelease;
      }
      return result;
    };
    const findUnique = jest.spyOn(prisma.adminMfaCredential, "findUnique").mockImplementation(
      staleReadImplementation as unknown as typeof prisma.adminMfaCredential.findUnique,
    );

    const competingBegin = service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    await staleReadReached;
    try {
      await expect(service.confirmEnrollment(
        adminUserId,
        adminSessionId,
        PASSWORD,
        generateCode(started.secret),
        context(),
      )).resolves.toMatchObject({ recoveryCodes: expect.any(Array) });
      releaseStaleRead();
      await expect(competingBegin).rejects.toMatchObject({ code: "MFA_ALREADY_ENABLED" });
    } finally {
      releaseStaleRead();
      findUnique.mockRestore();
    }

    expect(await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } }))
      .toMatchObject({ status: "ACTIVE", pendingExpiresAt: null });
    expect(await prisma.adminMfaRecoveryCode.count({ where: { credential: { userId: adminUserId } } })).toBe(10);
  });

  it("rejects an enrollment confirmation when another begin replaces its generation mid-flight", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const originalHash = passwordService.hash.bind(passwordService);
    let injected = false;
    const race = jest.spyOn(passwordService, "hash").mockImplementation(async (value: string) => {
      if (!injected) {
        injected = true;
        await prisma.adminMfaCredential.update({
          where: { userId: adminUserId },
          data: { secretEncrypted: "concurrent-enrollment-generation" },
        });
      }
      return originalHash(value);
    });
    try {
      await expect(service.confirmEnrollment(
        adminUserId,
        adminSessionId,
        PASSWORD,
        generateCode(started.secret),
        context(),
      )).rejects.toMatchObject({ code: "MFA_CONFLICT" });
    } finally {
      race.mockRestore();
    }
    expect(await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } }))
      .toMatchObject({ status: "PENDING", secretEncrypted: "concurrent-enrollment-generation" });
    expect(await prisma.adminMfaRecoveryCode.count({ where: { credential: { userId: adminUserId } } })).toBe(0);
  });

  it("binds outstanding login challenges to the exact MFA credential generation", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challenge = await service.createLoginChallenge(user, context());
    await prisma.adminMfaCredential.update({
      where: { userId: adminUserId },
      data: { secretEncrypted: "replacement-generation" },
    });

    await expect(completeChallenge(challenge.challengeToken, nextStepCode(started.secret)))
      .rejects.toMatchObject({ code: "MFA_CHALLENGE_INVALID" });
  });

  it("rolls enrollment activation and recovery codes back when MFA_ENABLED cannot persist", async () => {
    const started = await service.beginEnrollment(adminUserId, adminSessionId, PASSWORD, context());
    const eventFailure = jest.spyOn(securityEventService, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));
    try {
      await expect(service.confirmEnrollment(
        adminUserId,
        adminSessionId,
        PASSWORD,
        generateCode(started.secret),
        context(),
      ))
        .rejects.toThrow("event unavailable");
    } finally {
      eventFailure.mockRestore();
    }
    expect(await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } }))
      .toMatchObject({ status: "PENDING", confirmedAt: null });
    expect(await prisma.adminMfaRecoveryCode.count({ where: { credential: { userId: adminUserId } } })).toBe(0);
  });

  it("invalidates an outstanding challenge when the account changes before factor verification", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challenge = await service.createLoginChallenge(user, context());
    await prisma.user.update({
      where: { id: adminUserId },
      data: { status: "INACTIVE", passwordChangedAt: new Date(Date.now() + 1_000) },
    });
    await expect(completeChallenge(challenge.challengeToken, nextStepCode(started.secret)))
      .rejects.toMatchObject({ code: "MFA_CHALLENGE_INVALID" });
  });

  it("rolls challenge and factor consumption back when authenticated-session persistence fails", async () => {
    const { started } = await enroll();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } });
    const challenge = await service.createLoginChallenge(user, context());
    const code = nextStepCode(started.secret);

    await expect(service.completeLoginChallenge(
      challenge.challengeToken,
      code,
      context(),
      async () => { throw new Error("session persistence unavailable"); },
    )).rejects.toThrow("session persistence unavailable");

    expect(await prisma.adminMfaLoginChallenge.findFirstOrThrow({
      where: { userId: adminUserId },
      orderBy: { createdAt: "desc" },
    })).toMatchObject({ usedAt: null, attemptCount: 0 });
    await expect(completeChallenge(challenge.challengeToken, code)).resolves.toMatchObject({ id: adminUserId });
  });

  it("does not consume a second factor after guarded recovery-code regeneration and revocation", async () => {
    await enroll();
    const assuranceAt = new Date();
    await prisma.session.update({
      where: { id: adminSessionId },
      data: { mfaVerifiedAt: assuranceAt, recentAuthenticationAt: assuranceAt },
    });
    await expect(service.regenerateRecoveryCodes(adminUserId, context()))
      .resolves.toMatchObject({ recoveryCodes: expect.arrayContaining([expect.any(String)]) });
    await expect(service.revoke(adminUserId, context())).resolves.toBeUndefined();
    expect(await service.getStatus(adminUserId)).toMatchObject({ enrolled: false, status: "REVOKED" });
    expect(await prisma.session.findUniqueOrThrow({ where: { id: adminSessionId } }))
      .toMatchObject({ mfaVerifiedAt: null, recentAuthenticationAt: null });
  });

  it("rolls recovery-code regeneration back when its required event fails", async () => {
    const { confirmed } = await enroll();
    const beforeHashes = (await prisma.adminMfaRecoveryCode.findMany({
      where: { credential: { userId: adminUserId } }, orderBy: { id: "asc" }, select: { codeHash: true },
    })).map((row) => row.codeHash);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    const eventFailure = jest.spyOn(securityEventService, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));
    try {
      await expect(service.regenerateRecoveryCodes(adminUserId, context())).rejects.toThrow("event unavailable");
    } finally {
      eventFailure.mockRestore();
    }
    const afterHashes = (await prisma.adminMfaRecoveryCode.findMany({
      where: { credential: { userId: adminUserId } }, orderBy: { id: "asc" }, select: { codeHash: true },
    })).map((row) => row.codeHash);
    expect(afterHashes).toEqual(beforeHashes);
  });

  it("rolls credential revocation back when its required event fails", async () => {
    await enroll();
    const assuranceAt = new Date();
    await prisma.session.update({
      where: { id: adminSessionId },
      data: { mfaVerifiedAt: assuranceAt, recentAuthenticationAt: assuranceAt },
    });
    const eventFailure = jest.spyOn(securityEventService, "recordRequired").mockRejectedValueOnce(new Error("event unavailable"));
    try {
      await expect(service.revoke(adminUserId, context())).rejects.toThrow("event unavailable");
    } finally {
      eventFailure.mockRestore();
    }
    expect(await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } }))
      .toMatchObject({ status: "ACTIVE", revokedAt: null });
    expect(await prisma.adminMfaRecoveryCode.count({ where: { credential: { userId: adminUserId } } })).toBe(10);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: adminSessionId } }))
      .toMatchObject({ mfaVerifiedAt: assuranceAt, recentAuthenticationAt: assuranceAt });
  });

  it("atomically consumes a live factor and marks only the current usable session for step-up", async () => {
    const { started } = await enroll();
    const session = await prisma.session.create({
      data: {
        userId: adminUserId,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const result = await service.verifyStepUp(
      adminUserId,
      session.id,
      PASSWORD,
      nextStepCode(started.secret),
      context(),
    );

    const marked = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(marked.mfaVerifiedAt).toEqual(result.verifiedAt);
    expect(marked.recentAuthenticationAt).toEqual(result.verifiedAt);
    const event = await prisma.securityEvent.findFirst({
      where: { userId: adminUserId, sessionId: session.id, type: "MFA_VERIFIED" },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.metadata).toMatchObject({ purpose: "STEP_UP" });
  });

  it("does not mark assurance for a wrong factor or a revoked session", async () => {
    const { started } = await enroll();
    const session = await prisma.session.create({
      data: {
        userId: adminUserId,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(service.verifyStepUp(adminUserId, session.id, PASSWORD, "000000", context()))
      .rejects.toMatchObject({ code: "MFA_INVALID_CODE" });
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } }))
      .toMatchObject({ mfaVerifiedAt: null, recentAuthenticationAt: null });

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokedReason: "ADMIN_ACTION" } });
    const counterBefore = (await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } })).lastUsedCounter;
    await expect(service.verifyStepUp(adminUserId, session.id, PASSWORD, nextStepCode(started.secret), context()))
      .rejects.toMatchObject({ code: "MFA_CONFLICT" });
    expect((await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } })).lastUsedCounter)
      .toBe(counterBefore);
  });

  it("rate limits repeated step-up failures and fails before factor processing", async () => {
    await enroll();
    const session = await prisma.session.create({
      data: {
        userId: adminUserId,
        familyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const requestContext = { ipAddress: "203.0.113.250", userAgent: "rate-limit-test", requestId: randomUUID() };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.verifyStepUp(adminUserId, session.id, "wrong-password-value", "000000", requestContext))
        .rejects.toMatchObject({ code: "MFA_PASSWORD_INVALID" });
    }
    await expect(service.verifyStepUp(adminUserId, session.id, PASSWORD, "000000", requestContext))
      .rejects.toMatchObject({ code: "MFA_ATTEMPTS_EXCEEDED" });
  });

  it("refuses revocation when the privileged recovery alternative is not valid", async () => {
    await enroll();
    await prisma.user.update({ where: { id: adminUserId }, data: { recoveryEmail: null } });
    await expect(service.revoke(adminUserId, context()))
      .rejects.toMatchObject({ code: "MFA_CONFLICT" });
    expect(await prisma.adminMfaCredential.findUniqueOrThrow({ where: { userId: adminUserId } }))
      .toMatchObject({ status: "ACTIVE" });
  });
});

function generateCode(secret: string, timestamp = Date.now()): string {
  return TOTP.generate({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30, timestamp });
}
