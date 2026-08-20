import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "./password.service";
import { InMemoryMailTransport } from "../notifications/in-memory-mail.transport";
import { RedisService } from "../../common/redis/redis.service";
import { NotificationService } from "../notifications/notification.service";

const CURRENT_PASSWORD = "Current-Http-Password-99!";

function extractTokenFromResetUrl(body: string): string {
  const match = /token=([^&\s]+)/.exec(body);
  if (!match) throw new Error("no reset token found in captured email body");
  return decodeURIComponent(match[1]!);
}

function getSetCookieHeader(response: request.Response): string[] {
  const raw = response.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

describe("Password recovery endpoints (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let mailTransport: InMemoryMailTransport;
  let notificationService: NotificationService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    mailTransport = app.get(InMemoryMailTransport);
    notificationService = app.get(NotificationService);

    // Every in-process supertest request in this file resolves to the
    // same loopback address, so the forgot-password/reset-password/login
    // IP rate limiters (a real, persistent Redis counter that outlives a
    // single `npx jest` invocation) would otherwise accumulate across
    // repeated runs of this file and eventually shadow later tests with
    // a false rate-limit hit. Clearing only these key patterns (never a
    // broad FLUSHALL) keeps this file's runs independent without
    // touching any other state.
    const redisClient = app.get(RedisService).getClient();
    const keysToClear = [
      ...(await redisClient.keys("ratelimit:forgot-password:*")),
      ...(await redisClient.keys("ratelimit:reset-password:*")),
      ...(await redisClient.keys("ratelimit:login:*")),
    ];
    if (keysToClear.length > 0) {
      await redisClient.del(...keysToClear);
    }
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  afterEach(() => {
    mailTransport.clear();
  });

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `http-test-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(CURRENT_PASSWORD),
        fullName: "HTTP Test User",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function waitForBackgroundWork(): Promise<void> {
    await notificationService.processAvailableJobs();
  }

  describe("POST /api/v1/auth/forgot-password", () => {
    it("returns 200 with the identical generic message for an existing account", async () => {
      const user = await createUser();
      const response = await request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email: user.email });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/si la cuenta existe/i);
    });

    it("returns 200 with the identical generic message for an account that does not exist", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .send({ email: `nobody-${randomUUID()}@example.com` });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/si la cuenta existe/i);
    });

    it("rejects a malformed body via the global ValidationPipe", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email: "not-an-email" });
      expect(response.status).toBe(400);
    });

    it("never returns the reset token in the response body", async () => {
      const user = await createUser();
      const response = await request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email: user.email });
      expect(JSON.stringify(response.body)).not.toMatch(/token/i);
    });
  });

  describe("POST /api/v1/auth/reset-password (end to end via the in-memory mail transport)", () => {
    it("resets the password using the token captured from the queued notification", async () => {
      const user = await createUser();
      await request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email: user.email });
      await waitForBackgroundWork();

      const message = mailTransport.findLastMessageTo(user.email);
      expect(message).toBeDefined();
      const token = extractTokenFromResetUrl(message!.textBody);

      const resetResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: "Http-New-Strong-99!", confirmPassword: "Http-New-Strong-99!" });

      expect(resetResponse.status).toBe(200);
      expect(resetResponse.body.message).toMatch(/restablecida/i);

      const loginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "Http-New-Strong-99!" });
      expect(loginResponse.status).toBe(200);
    });

    it("rejects a confirmPassword that does not match newPassword with a 400", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token: "a".repeat(40), newPassword: "Strong-Enough-99!", confirmPassword: "Different-99!" });
      expect(response.status).toBe(400);
    });

    it("returns 400 with an INVALID_OR_EXPIRED_TOKEN code for an unknown token", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token: "z".repeat(40), newPassword: "Strong-Enough-99!", confirmPassword: "Strong-Enough-99!" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");
    });

    it("rejects reusing an already-used token with a distinct code, over real HTTP", async () => {
      const user = await createUser();
      await request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email: user.email });
      await waitForBackgroundWork();
      const token = extractTokenFromResetUrl(mailTransport.findLastMessageTo(user.email)!.textBody);

      await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: "First-Use-Strong-99!", confirmPassword: "First-Use-Strong-99!" });

      const secondAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: "Second-Use-Strong-99!", confirmPassword: "Second-Use-Strong-99!" });

      expect(secondAttempt.status).toBe(400);
      expect(secondAttempt.body.code).toBe("TOKEN_ALREADY_USED");
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("returns 401 without a valid access-token cookie", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .send({ currentPassword: "whatever", newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" });
      expect(response.status).toBe(401);
    });

    it("changes the password and keeps the current session's refresh token usable, even though its old access token is now invalid", async () => {
      const user = await createUser();
      const loginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: CURRENT_PASSWORD });
      const cookies = getSetCookieHeader(loginResponse);

      // JWT `iat` only has whole-second resolution, and the guard
      // deliberately treats a token issued in the *same* second as
      // passwordChangedAt as still valid (see JwtAuthGuard's doc
      // comment - otherwise an immediate post-change /refresh could be
      // incorrectly rejected by sub-second luck). Waiting past the
      // second boundary here makes this test assert the real intended
      // behavior (a token from a clearly *earlier* second) rather than
      // depend on which side of a second boundary two fast HTTP calls
      // happen to land on.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const changeResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Cookie", cookies)
        .send({ currentPassword: CURRENT_PASSWORD, newPassword: "Http-Changed-Strong-99!", confirmPassword: "Http-Changed-Strong-99!" });

      expect(changeResponse.status).toBe(200);

      // The passwordChangedAt claim check (US-007 section 9) is
      // deliberately universal - it invalidates every already-issued
      // access token, including the one from the session that just
      // performed the change, closing the stateless-access-token gap for
      // every device at once.
      const meWithOldAccessToken = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
      expect(meWithOldAccessToken.status).toBe(401);

      // But the documented session-level decision still holds: this
      // session's *refresh token* was never revoked (unlike password
      // reset, which revokes every session), so refreshing seamlessly
      // mints a new, valid access token without a full re-login.
      const refreshResponse = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookies);
      expect(refreshResponse.status).toBe(200);
      const refreshedCookies = getSetCookieHeader(refreshResponse);

      const meWithRefreshedAccessToken = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", refreshedCookies);
      expect(meWithRefreshedAccessToken.status).toBe(200);

      const newLoginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "Http-Changed-Strong-99!" });
      expect(newLoginResponse.status).toBe(200);
    });

    it("rejects the wrong current password with a 400 and a safe code, without leaking why", async () => {
      const user = await createUser();
      const loginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: CURRENT_PASSWORD });
      const cookies = getSetCookieHeader(loginResponse);

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Cookie", cookies)
        .send({ currentPassword: "wrong-password", newPassword: "Whatever-Strong-99!", confirmPassword: "Whatever-Strong-99!" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("CURRENT_PASSWORD_INVALID");
      expect(JSON.stringify(response.body)).not.toMatch(/argon2|stack|prisma/i);
    });
  });
});
