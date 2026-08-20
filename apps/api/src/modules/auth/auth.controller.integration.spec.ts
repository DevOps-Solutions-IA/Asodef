import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "./password.service";
import { AuthService, RateLimitedException } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AuthCookieService } from "./auth-cookie.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { RedisService } from "../../common/redis/redis.service";
import { AdminMfaService } from "./mfa/admin-mfa.service";
import { MfaRequiredException } from "./mfa/mfa.types";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Auth endpoints (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    // Every in-process supertest request in this file resolves to the
    // same loopback address, so LOGIN_RATE_LIMIT's IP-keyed Redis counter
    // (persistent across separate `npx jest`/turbo runs, and shared with
    // any other controller-integration file exercising /login from the
    // same address) could otherwise accumulate and shadow this file's
    // own tests with a false 429. Clearing only this key pattern (never
    // a broad FLUSHALL) keeps this file's runs independent.
    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `test-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "HTTP Test User",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  function getSetCookieHeader(response: request.Response): string[] {
    const raw = response.headers["set-cookie"];
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  describe("POST /api/v1/auth/login", () => {
    it("returns 200 with only safe user fields and sets httpOnly cookies", async () => {
      const user = await createUser();

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user: { id: user.id, email: user.email, fullName: user.fullName, status: "ACTIVE" },
      });
      expect(JSON.stringify(response.body)).not.toMatch(/password|token|hash/i);

      const cookies = getSetCookieHeader(response);
      expect(cookies.length).toBe(2);
      expect(cookies.every((cookie) => /HttpOnly/i.test(cookie))).toBe(true);
      expect(cookies.some((cookie) => cookie.startsWith("asodef_at="))).toBe(true);
      expect(cookies.some((cookie) => cookie.startsWith("asodef_rt="))).toBe(true);
    });

    it("uses secure:false cookies in the non-production test environment", async () => {
      const user = await createUser();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: TEST_PASSWORD });

      const cookies = getSetCookieHeader(response);
      expect(cookies.every((cookie) => !/Secure/i.test(cookie))).toBe(true);
    });

    it("returns 401 with a generic message for wrong credentials, no stack trace or internals", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: `nobody-${randomUUID()}@example.com`, password: "wrong" });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Credenciales inválidas.");
      expect(JSON.stringify(response.body)).not.toMatch(/stack|prisma|postgres/i);
    });

    it("rejects a malformed login body (missing password) via the global ValidationPipe", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "not-even-an-email" });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns 401 when there is no auth cookie at all (missing authentication)", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
    });

    it("returns 401 for a malformed/garbage access-token cookie", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", "asodef_at=not-a-real-jwt-value");
      expect(response.status).toBe(401);
    });

    it("returns the safe current-user shape for a valid session, with no sensitive fields", async () => {
      const user = await createUser();
      const loginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: TEST_PASSWORD });
      const cookies = getSetCookieHeader(loginResponse);

      const meResponse = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body).toMatchObject({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: "ACTIVE",
        roles: expect.any(Array),
        permissions: expect.any(Array),
      });
      expect(meResponse.body).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(meResponse.body)).not.toMatch(/passwordHash|refreshTokenHash/i);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("clears both auth cookies (expired Max-Age/Expires in the past)", async () => {
      const user = await createUser();
      const loginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: TEST_PASSWORD });
      const loginCookies = getSetCookieHeader(loginResponse);

      const logoutResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Cookie", loginCookies);

      expect(logoutResponse.status).toBe(200);
      const clearedCookies = getSetCookieHeader(logoutResponse);
      expect(clearedCookies.some((c) => /asodef_at=;/.test(c) || /Max-Age=0/i.test(c))).toBe(true);

      // A copied access cookie must stop working immediately as well; the
      // global guard validates its server-side session on every request.
      const replayedAccess = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", loginCookies);
      expect(replayedAccess.status).toBe(401);
    });

    it("is idempotent when called with no cookies at all", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/auth/logout");
      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/v1/auth/logout-all requires authentication", () => {
    it("returns 401 without a valid access-token cookie", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/auth/logout-all");
      expect(response.status).toBe(401);
    });
  });
});

describe("AuthController -> 429 mapping (RateLimitedException, isolated from real Redis rate-limit state)", () => {
  it("maps a RateLimitedException from the service into a 429 response with a safe message and retryAfterSeconds", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login: jest.fn().mockRejectedValue(new RateLimitedException(42)) } },
        {
          provide: AuthCookieService,
          useValue: { setAccessTokenCookie: jest.fn(), setRefreshTokenCookie: jest.fn(), clearAuthCookies: jest.fn() },
        },
        { provide: PasswordRecoveryService, useValue: {} },
        { provide: AdminMfaService, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "someone@example.com", password: "whatever-long-enough" });

    expect(response.status).toBe(429);
    expect(response.body.message).toMatch(/demasiados intentos/i);
    expect(response.body.retryAfterSeconds).toBe(42);

    await app.close();
  });
});

describe("AuthController MFA pre-authentication boundary", () => {
  it("returns an MFA challenge without setting authentication cookies", async () => {
    const cookieService = {
      setAccessTokenCookie: jest.fn(),
      setRefreshTokenCookie: jest.fn(),
      clearAuthCookies: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockRejectedValue(new MfaRequiredException("opaque-challenge-token-value-123456", new Date("2030-01-01T00:00:00Z"))),
          },
        },
        { provide: AuthCookieService, useValue: cookieService },
        { provide: PasswordRecoveryService, useValue: {} },
        { provide: AdminMfaService, useValue: {} },
      ],
    }).compile();
    const isolatedApp = moduleRef.createNestApplication();
    await isolatedApp.init();

    const response = await request(isolatedApp.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@asodef.com.co", password: "valid-password-value" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mfaRequired: true, challengeToken: "opaque-challenge-token-value-123456" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(cookieService.setAccessTokenCookie).not.toHaveBeenCalled();
    expect(cookieService.setRefreshTokenCookie).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
    await isolatedApp.close();
  });

  it("performs step-up on the current session without minting cookies or a new session", async () => {
    const cookieService = {
      setAccessTokenCookie: jest.fn(),
      setRefreshTokenCookie: jest.fn(),
      clearAuthCookies: jest.fn(),
    };
    const verifyStepUp = jest.fn().mockResolvedValue({ verifiedAt: new Date("2030-01-01T00:00:00Z") });
    const currentUser = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "admin@asodef.com.co",
      fullName: "Administrator",
      status: "ACTIVE",
      roles: ["SUPER_ADMIN"],
      permissions: [],
      sessionId: "00000000-0000-4000-8000-000000000002",
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: AuthCookieService, useValue: cookieService },
        { provide: PasswordRecoveryService, useValue: {} },
        { provide: AdminMfaService, useValue: { verifyStepUp } },
      ],
    }).compile();
    const isolatedApp = moduleRef.createNestApplication();
    isolatedApp.use((req: { user?: typeof currentUser }, _res: unknown, next: () => void) => {
      req.user = currentUser;
      next();
    });
    await isolatedApp.init();

    const response = await request(isolatedApp.getHttpServer())
      .post("/auth/step-up")
      .send({ password: TEST_PASSWORD, code: "123456" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ verifiedAt: "2030-01-01T00:00:00.000Z" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(verifyStepUp).toHaveBeenCalledWith(
      currentUser.id,
      currentUser.sessionId,
      TEST_PASSWORD,
      "123456",
      expect.objectContaining({ requestId: null }),
    );
    expect(cookieService.setAccessTokenCookie).not.toHaveBeenCalled();
    expect(cookieService.setRefreshTokenCookie).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
    await isolatedApp.close();
  });

  it("requires and forwards the current password at both enrollment boundaries", async () => {
    const currentUser = {
      id: "00000000-0000-4000-8000-000000000011",
      email: "admin@asodef.com.co",
      fullName: "Administrator",
      status: "ACTIVE",
      roles: ["SUPER_ADMIN"],
      permissions: [],
      sessionId: "00000000-0000-4000-8000-000000000012",
    };
    const beginEnrollment = jest.fn().mockResolvedValue({
      secret: "SAFE-TEST-SECRET",
      otpauthUri: "otpauth://totp/ASODEF:test",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    const confirmEnrollment = jest.fn().mockResolvedValue({ recoveryCodes: ["AAAA-BBBB-CCCC"] });
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: AuthCookieService, useValue: {} },
        { provide: PasswordRecoveryService, useValue: {} },
        { provide: AdminMfaService, useValue: { beginEnrollment, confirmEnrollment } },
      ],
    }).compile();
    const isolatedApp = moduleRef.createNestApplication();
    isolatedApp.use((req: { user?: typeof currentUser }, _res: unknown, next: () => void) => {
      req.user = currentUser;
      next();
    });
    await isolatedApp.init();

    const begin = await request(isolatedApp.getHttpServer())
      .post("/auth/mfa/enrollment")
      .send({ password: TEST_PASSWORD });
    expect(begin.status).toBe(201);
    expect(beginEnrollment).toHaveBeenCalledWith(
      currentUser.id,
      currentUser.sessionId,
      TEST_PASSWORD,
      expect.objectContaining({ requestId: null }),
    );

    const confirm = await request(isolatedApp.getHttpServer())
      .post("/auth/mfa/enrollment/confirm")
      .send({ password: TEST_PASSWORD, code: "123456" });
    expect(confirm.status).toBe(201);
    expect(confirmEnrollment).toHaveBeenCalledWith(
      currentUser.id,
      currentUser.sessionId,
      TEST_PASSWORD,
      "123456",
      expect.objectContaining({ requestId: null }),
    );
    await isolatedApp.close();
  });
});
