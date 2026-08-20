import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const PASSWORD = "Audit-Integration-Password-99!";

describe("GET /api/v1/admin/auditoria", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  const userIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    passwordService = app.get(PasswordService);
  });

  afterAll(async () => {
    if (eventIds.length > 0) await prisma.securityEvent.deleteMany({ where: { id: { in: eventIds } } });
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function cookiesFor(roleName: "AUDITOR" | "CUSTOMER"): Promise<string[]> {
    const user = await prisma.user.create({
      data: {
        email: `audit-timeline-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(PASSWORD),
        fullName: "Audit Timeline Test",
      },
    });
    userIds.push(user.id);
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const raw = login.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  it("requires authentication and audit.read", async () => {
    expect((await request(app.getHttpServer()).get("/api/v1/admin/auditoria")).status).toBe(401);
    const customerCookies = await cookiesFor("CUSTOMER");
    expect((await request(app.getHttpServer()).get("/api/v1/admin/auditoria").set("Cookie", customerCookies)).status).toBe(403);
  });

  it("returns a paginated, ordered and redacted security timeline", async () => {
    const auditorCookies = await cookiesFor("AUDITOR");
    for (let index = 0; index < 3; index += 1) {
      const event = await prisma.securityEvent.create({
        data: {
          type: "LOGIN_FAILED",
          requestId: randomUUID(),
          metadata: { password: `secret-${index}`, email: `pii-${index}@example.com` },
          createdAt: new Date(Date.now() + index * 1_000),
        },
      });
      eventIds.push(event.id);
    }

    const first = await request(app.getHttpServer())
      .get("/api/v1/admin/auditoria?source=SECURITY&action=LOGIN_FAILED&pageSize=2")
      .set("Cookie", auditorCookies);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ total: expect.any(Number), pageSize: 2, nextCursor: expect.any(String) });
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0]).toMatchObject({ source: "SECURITY", action: "LOGIN_FAILED", result: "UNKNOWN", actorId: null });
    expect(first.body.items[0].requestId).toEqual(expect.any(String));
    expect(first.body.items[0].correlationId).toBeNull();
    expect(JSON.stringify(first.body)).not.toMatch(/secret-|pii-|metadata|userAgent|ipAddress/i);

    const second = await request(app.getHttpServer())
      .get(`/api/v1/admin/auditoria?source=SECURITY&action=LOGIN_FAILED&pageSize=2&cursor=${encodeURIComponent(first.body.nextCursor as string)}`)
      .set("Cookie", auditorCookies);
    expect(second.status).toBe(200);
    expect(second.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it("treats a date-only to filter as the complete UTC day and never returns arbitrary metadata", async () => {
    const auditorCookies = await cookiesFor("AUDITOR");
    const included = await prisma.securityEvent.create({
      data: {
        type: "LOGIN_FAILED",
        requestId: randomUUID(),
        metadata: { arbitrary: "must-never-render", password: "not-a-real-secret" },
        createdAt: new Date("2037-04-02T23:59:59.500Z"),
      },
    });
    const excluded = await prisma.securityEvent.create({
      data: {
        type: "LOGIN_FAILED",
        requestId: randomUUID(),
        metadata: { arbitrary: "outside-range" },
        createdAt: new Date("2037-04-03T00:00:00.000Z"),
      },
    });
    eventIds.push(included.id, excluded.id);

    const response = await request(app.getHttpServer())
      .get("/api/v1/admin/auditoria?source=SECURITY&action=LOGIN_FAILED&from=2037-04-02&to=2037-04-02&pageSize=20")
      .set("Cookie", auditorCookies);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toContain(`SECURITY:${included.id}`);
    expect(response.body.items.map((item: { id: string }) => item.id)).not.toContain(`SECURITY:${excluded.id}`);
    expect(JSON.stringify(response.body)).not.toMatch(/must-never-render|not-a-real-secret|outside-range|metadata/i);
  });
});
