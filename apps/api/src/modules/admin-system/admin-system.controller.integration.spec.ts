import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("GET /api/v1/admin/sistema", () => {
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

  async function actor(roleName: "SUPER_ADMIN" | "CUSTOMER"): Promise<string[]> {
    const user = await prisma.user.create({
      data: {
        email: `admin-system-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Admin System Test",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const raw = login.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  it("requires authentication", async () => {
    expect((await request(app.getHttpServer()).get("/api/v1/admin/sistema")).status).toBe(401);
  });

  it("requires settings.manage rather than any authenticated role", async () => {
    const cookies = await actor("CUSTOMER");
    expect((await request(app.getHttpServer()).get("/api/v1/admin/sistema").set("Cookie", cookies)).status).toBe(403);
  });

  it("returns a sanitized real system snapshot to an authorized operator", async () => {
    const cookies = await actor("SUPER_ADMIN");
    const response = await request(app.getHttpServer()).get("/api/v1/admin/sistema").set("Cookie", cookies);
    expect(response.status).toBe(200);
    expect(response.body.api.status).toBe("AVAILABLE");
    expect(["AVAILABLE", "UNAVAILABLE"]).toContain(response.body.dependencies.postgres.status);
    expect(["AVAILABLE", "UNAVAILABLE"]).toContain(response.body.dependencies.redis.status);
    expect(["AVAILABLE", "UNAVAILABLE", "NOT_CONFIGURED"]).toContain(response.body.dependencies.master.status);
    expect(response.body.notifications).toEqual(expect.objectContaining({
      status: expect.any(String),
      backlog: expect.any(Number),
      failed: expect.any(Number),
      deadLetter: expect.any(Number),
    }));
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/password|connectionString|databaseUrl|redisUrl/i);
    expect(response.body.errorRate).toBeUndefined();
  });
});
