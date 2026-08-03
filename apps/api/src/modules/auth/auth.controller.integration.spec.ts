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
