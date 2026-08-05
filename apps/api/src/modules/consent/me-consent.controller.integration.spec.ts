import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { User } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";
import { RedisService } from "../../common/redis/redis.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("GET /me/consent-records (US-071, integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const createdUserIds: string[] = [];
  const createdConsentRecordIds: string[] = [];

  let userA: { user: User; cookies: string[] };
  let userB: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    userA = await createActor();
    userB = await createActor();

    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "data_processing" } });
    const recordA = await prisma.consentRecord.create({
      data: { consentPurposeId: purpose.id, userId: userA.user.id, status: "GRANTED", source: "test", acceptanceMethod: "checkbox" },
    });
    createdConsentRecordIds.push(recordA.id);
  });

  afterAll(async () => {
    if (createdConsentRecordIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { id: { in: createdConsentRecordIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `me-consent-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Me Consent Test User",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function loginAs(user: User): Promise<string[]> {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: user.email, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    const raw = response.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  async function createActor(): Promise<{ user: User; cookies: string[] }> {
    const user = await createUser();
    const cookies = await loginAs(user);
    return { user, cookies };
  }

  it("Negative case (AC): an unauthenticated request is rejected", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me/consent-records");
    expect(response.status).toBe(401);
  });

  it("Example (AC): returns the caller's own consent records with purpose/status/date", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me/consent-records").set("Cookie", userA.cookies);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ purposeKey: "data_processing", status: "GRANTED", source: "test", acceptanceMethod: "checkbox" });
    expect(response.body[0].createdAt).toBeTruthy();
  });

  it("IDOR guard: a different authenticated user never sees userA's consent records - no request parameter can leak them either", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me/consent-records").set("Cookie", userB.cookies);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);

    // The route takes no id/userId at all - there is nothing to smuggle
    // in query string that would target another user's records.
    const withQueryParam = await request(app.getHttpServer())
      .get(`/api/v1/me/consent-records?userId=${userA.user.id}`)
      .set("Cookie", userB.cookies);
    expect(withQueryParam.status).toBe(200);
    expect(withQueryParam.body).toHaveLength(0);
  });

  it("Negative case (AC): a user with zero consent records gets an empty array, not an error", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me/consent-records").set("Cookie", userB.cookies);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
