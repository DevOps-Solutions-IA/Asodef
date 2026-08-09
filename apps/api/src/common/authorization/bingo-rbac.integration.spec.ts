import { randomUUID } from "node:crypto";
import { Controller, Get, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { validateEnv } from "../../config/env.validation";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { seedRbac } from "../../database/seed-rbac";
import { RequirePermissions } from "../../modules/auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../modules/auth/guards/permissions.guard";
import { TokenService } from "../../modules/auth/token.service";
import { SecurityEventsModule } from "../security-events/security-events.module";

/**
 * Test-only routes prove the production authorization guard evaluates
 * concrete Bingo permissions loaded from the database. They intentionally
 * do not introduce a production Bingo API before ETAPA 6.
 */
@Controller("test-bingo-rbac")
class BingoRbacTestController {
  @RequirePermissions("bingo.operate")
  @Get("operate")
  operate() {
    return { ok: true };
  }

  @RequirePermissions("bingo.validate")
  @Get("supervisor-validation")
  validate() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    JwtModule.register({}),
    PrismaModule,
    SecurityEventsModule,
  ],
  controllers: [BingoRbacTestController],
  providers: [
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TokenService],
})
class BingoRbacTestModule {}

describe("Bingo RBAC permissions (integration, real Postgres)", () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [BingoRbacTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
    await seedRbac(prisma);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
  });

  async function cookieForRole(roleName: string): Promise<string> {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const user = await prisma.user.create({
      data: {
        email: `bingo-rbac-${randomUUID()}@example.com`,
        passwordHash: "irrelevant-for-this-suite",
        fullName: "Bingo RBAC Test User",
        status: "ACTIVE",
        roles: { create: { roleId: role.id } },
      },
    });
    createdUserIds.push(user.id);
    return `asodef_at=${tokenService.signAccessToken({ sub: user.id, sid: randomUUID() })}`;
  }

  it("allows BINGO_OPERATOR to execute an operation authorized by bingo.operate", async () => {
    const response = await request(app.getHttpServer())
      .get("/test-bingo-rbac/operate")
      .set("Cookie", await cookieForRole("BINGO_OPERATOR"));

    expect(response.status).toBe(200);
  });

  it("rejects BINGO_OPERATOR from supervisor validation with 403", async () => {
    const response = await request(app.getHttpServer())
      .get("/test-bingo-rbac/supervisor-validation")
      .set("Cookie", await cookieForRole("BINGO_OPERATOR"));

    expect(response.status).toBe(403);
  });

  it("allows BINGO_SUPERVISOR to operate and validate by concrete permissions", async () => {
    const cookie = await cookieForRole("BINGO_SUPERVISOR");
    const [operation, validation] = await Promise.all([
      request(app.getHttpServer()).get("/test-bingo-rbac/operate").set("Cookie", cookie),
      request(app.getHttpServer()).get("/test-bingo-rbac/supervisor-validation").set("Cookie", cookie),
    ]);

    expect(operation.status).toBe(200);
    expect(validation.status).toBe(200);
  });

  it("rejects a user without Bingo permissions with 403", async () => {
    const response = await request(app.getHttpServer())
      .get("/test-bingo-rbac/operate")
      .set("Cookie", await cookieForRole("CUSTOMER"));

    expect(response.status).toBe(403);
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("keeps %s authorized for Bingo administration", async (roleName) => {
    const cookie = await cookieForRole(roleName);
    const [operation, validation] = await Promise.all([
      request(app.getHttpServer()).get("/test-bingo-rbac/operate").set("Cookie", cookie),
      request(app.getHttpServer()).get("/test-bingo-rbac/supervisor-validation").set("Cookie", cookie),
    ]);

    expect(operation.status).toBe(200);
    expect(validation.status).toBe(200);
  });
});
