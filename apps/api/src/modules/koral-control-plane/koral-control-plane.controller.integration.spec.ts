import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { PasswordService } from "../auth/password.service";

const TEST_PASSWORD = "correct-horse-battery-staple-123";

describe("Koral Control Plane HTTP", () => {
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
    if (createdUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function actor(roleName: "SUPER_ADMIN" | "CUSTOMER"): Promise<string[]> {
    const user = await prisma.user.create({
      data: {
        email: `koral-control-${randomUUID()}@example.com`,
        passwordHash: await passwordService.hash(TEST_PASSWORD),
        fullName: "Koral Control Plane Test",
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const raw = login.headers["set-cookie"];
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }

  it("requires authentication and settings.manage", async () => {
    expect((await request(app.getHttpServer()).get("/api/v1/admin/koral/control-plane/tools")).status).toBe(401);
    const cookies = await actor("CUSTOMER");
    expect((await request(app.getHttpServer()).get("/api/v1/admin/koral/control-plane/tools").set("Cookie", cookies)).status).toBe(403);
  });

  it("returns sanitized tool truth to an authorized operator", async () => {
    const cookies = await actor("SUPER_ADMIN");
    const response = await request(app.getHttpServer()).get("/api/v1/admin/koral/control-plane/tools").set("Cookie", cookies);
    expect(response.status).toBe(200);
    expect(response.body.runtime).toEqual({ registered: false, reason: "TOOL_GATEWAY_UNAVAILABLE" });
    expect(response.body.summary.executable).toBe(0);
    expect(response.body.tools.every((tool: { runtimeExecutable: boolean }) => tool.runtimeExecutable === false)).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/OPENROUTER_API_KEY|password|credential/i);
  });

  it("rejects unbounded analytics ranges before reading telemetry", async () => {
    const cookies = await actor("SUPER_ADMIN");
    expect((await request(app.getHttpServer()).get("/api/v1/admin/koral/control-plane/analytics?hours=721").set("Cookie", cookies)).status).toBe(400);
    expect((await request(app.getHttpServer()).get("/api/v1/admin/koral/control-plane/automations?hours=24&limit=101").set("Cookie", cookies)).status).toBe(400);
  });
});
