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
import { seedCommunicationTemplates } from "../../database/seed-communication-templates";
import { NotificationService } from "../notifications/notification.service";

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

describe("POST /me/consent-records/:purposeKey/revoke (US-073, integration, real HTTP + Postgres)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let notificationService: NotificationService;
  const createdUserIds: string[] = [];

  let actor: { user: User; cookies: string[] };
  let otherActor: { user: User; cookies: string[] };

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
    notificationService = app.get(NotificationService);
    await seedCommunicationTemplates(prisma);

    const redisClient = app.get(RedisService).getClient();
    const loginKeys = await redisClient.keys("ratelimit:login:*");
    if (loginKeys.length > 0) {
      await redisClient.del(...loginKeys);
    }

    actor = await createActor();
    otherActor = await createActor();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function createUser(): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: `revoke-actor-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Revoke Test User",
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

  async function grantOptionalMarketing(userId: string): Promise<void> {
    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "optional_marketing" } });
    await prisma.consentRecord.create({
      data: { consentPurposeId: purpose.id, userId, status: "GRANTED", source: "test", acceptanceMethod: "checkbox" },
    });
  }

  it("Negative case (AC): revoking a non-revocable purpose (terms_and_conditions) returns 400", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/me/consent-records/terms_and_conditions/revoke")
      .set("Cookie", actor.cookies);
    expect(response.status).toBe(400);
  });

  it("Negative case: revoking a revocable purpose with no active grant returns 409", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/me/consent-records/optional_marketing/revoke").set("Cookie", actor.cookies);
    expect(response.status).toBe(409);
  });

  it("Example (AC): revokes the caller's own GRANTED optional_marketing consent", async () => {
    await grantOptionalMarketing(actor.user.id);

    const response = await request(app.getHttpServer()).post("/api/v1/me/consent-records/optional_marketing/revoke").set("Cookie", actor.cookies);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ purposeKey: "optional_marketing", status: "REVOKED" });
    expect(response.body.revokedAt).toBeTruthy();

    const record = await prisma.consentRecord.findFirst({ where: { userId: actor.user.id, consentPurpose: { key: "optional_marketing" } } });
    expect(record?.status).toBe("REVOKED");
  });

  it("IDOR guard: revoking only ever affects the caller's own record, never another user's grant for the same purpose", async () => {
    await grantOptionalMarketing(otherActor.user.id);

    // actor has no active grant at this point (revoked in the previous test).
    const blocked = await request(app.getHttpServer()).post("/api/v1/me/consent-records/optional_marketing/revoke").set("Cookie", actor.cookies);
    expect(blocked.status).toBe(409);

    const otherRecord = await prisma.consentRecord.findFirst({ where: { userId: otherActor.user.id, consentPurpose: { key: "optional_marketing" } } });
    expect(otherRecord?.status).toBe("GRANTED");
  });

  it("End-to-end (AC): after self-service revocation, NotificationService.send() suppresses a subsequent marketing message to that user", async () => {
    const thirdActor = await createActor();
    await grantOptionalMarketing(thirdActor.user.id);

    const beforeRevoke = await notificationService.send("general_marketing", thirdActor.user.email, {});
    expect(beforeRevoke.status).toBe("SENT");

    const revokeResponse = await request(app.getHttpServer())
      .post("/api/v1/me/consent-records/optional_marketing/revoke")
      .set("Cookie", thirdActor.cookies);
    expect(revokeResponse.status).toBe(200);

    const afterRevoke = await notificationService.send("general_marketing", thirdActor.user.email, {});
    expect(afterRevoke.status).toBe("SUPPRESSED");
    expect(afterRevoke.errorCategory).toBe("marketing_consent_not_granted");
  });
});
