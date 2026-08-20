import { randomUUID } from "node:crypto";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import request from "supertest";
import cookieParser from "cookie-parser";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../modules/auth/guards/permissions.guard";
import { RolesGuard } from "../../modules/auth/guards/roles.guard";
import { StepUpGuard } from "../../modules/auth/guards/step-up.guard";
import { RequirePermissions } from "../../modules/auth/decorators/permissions.decorator";
import { RequireRoles } from "../../modules/auth/decorators/roles.decorator";
import { RequireStepUp } from "../../modules/auth/decorators/require-step-up.decorator";
import { TokenService } from "../../modules/auth/token.service";
import { SessionService } from "../../modules/auth/session.service";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { SecurityEventsModule } from "../security-events/security-events.module";
import { seedRbac } from "../../database/seed-rbac";
import { validateEnv } from "../../config/env.validation";

/**
 * A throwaway route requiring *both* a role and a permission, used only
 * to prove the two guards compose with AND semantics (US-008 section 3:
 * "combined role and permission requirements") - no such route exists in
 * the real app yet, so this is exercised via a dedicated test module
 * rather than a production controller.
 */
// FINANCE and "customers.read" are deliberately chosen so all four
// role/permission combinations can be built from *real* seeded roles:
// FINANCE never grants customers.read, and COMMERCIAL/CUSTOMER_SERVICE
// grant customers.read without the FINANCE role.
@Controller("test-combined")
class CombinedGuardTestController {
  @RequireRoles("FINANCE")
  @RequirePermissions("customers.read")
  @Get()
  handle() {
    return { ok: true };
  }
}

@Controller("test-step-up")
class StepUpGuardTestController {
  @RequireStepUp()
  @Get()
  handle() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    JwtModule.register({}),
    PrismaModule,
    SecurityEventsModule,
  ],
  controllers: [CombinedGuardTestController, StepUpGuardTestController],
  providers: [
    TokenService,
    SessionService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: StepUpGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // Exported so the test itself can retrieve TokenService to mint
  // access tokens - everything else needed (PrismaService) comes from
  // the @Global() PrismaModule already imported above.
  exports: [TokenService],
})
class CombinedGuardTestModule {}

describe("Guard composition and ordering (US-008)", () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let sessionService: SessionService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CombinedGuardTestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tokenService = moduleRef.get(TokenService);
    sessionService = moduleRef.get(SessionService);
    await seedRbac(prisma);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
  });

  async function createUserWithRoles(roleNames: string[]) {
    const roles = await prisma.role.findMany({ where: { name: { in: roleNames } } });
    const user = await prisma.user.create({
      data: {
        email: `combined-${randomUUID()}@example.com`,
        passwordHash: "irrelevant-for-this-suite",
        fullName: "Combined Guard Test User",
        status: "ACTIVE",
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function cookieFor(userId: string): Promise<string> {
    const { session } = await sessionService.createSession(userId, {
      ipAddress: "127.0.0.1",
      userAgent: "guard-composition-integration",
    });
    const token = tokenService.signAccessToken({ sub: userId, sid: session.id });
    return `asodef_at=${token}`;
  }

  it("returns 401 with no token at all - authentication runs before role/permission evaluation", async () => {
    const response = await request(app.getHttpServer()).get("/test-combined");
    expect(response.status).toBe(401);
  });

  it("returns 401 with a malformed token - never leaks whether role/permission would have passed", async () => {
    const response = await request(app.getHttpServer()).get("/test-combined").set("Cookie", "asodef_at=not-a-real-jwt");
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user holds the required role but not the required permission", async () => {
    // FINANCE satisfies @RequireRoles("FINANCE") but FINANCE's permission
    // set never includes customers.read.
    const user = await createUserWithRoles(["FINANCE"]);
    const response = await request(app.getHttpServer()).get("/test-combined").set("Cookie", await cookieFor(user.id));
    expect(response.status).toBe(403);
  });

  it("returns 403 when the user holds the required permission but not the required role", async () => {
    // COMMERCIAL grants customers.read (@RequirePermissions passes) but
    // is not FINANCE (@RequireRoles fails) - proves both guards must
    // independently pass, not just one of the two.
    const user = await createUserWithRoles(["COMMERCIAL"]);
    const response = await request(app.getHttpServer()).get("/test-combined").set("Cookie", await cookieFor(user.id));
    expect(response.status).toBe(403);
  });

  it("returns 403 when the user holds neither the required role nor the required permission", async () => {
    const user = await createUserWithRoles(["AUDITOR"]);
    const response = await request(app.getHttpServer()).get("/test-combined").set("Cookie", await cookieFor(user.id));
    expect(response.status).toBe(403);
  });

  it("returns 200 only when the user holds both the required role AND the required permission", async () => {
    const user = await createUserWithRoles(["FINANCE", "COMMERCIAL"]);
    const response = await request(app.getHttpServer()).get("/test-combined").set("Cookie", await cookieFor(user.id));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("permission changes take effect on the very next request - no caching/staleness (US-008 section 8)", async () => {
    const user = await createUserWithRoles(["FINANCE"]); // role satisfied, permission still missing
    const cookie = await cookieFor(user.id);

    const before = await request(app.getHttpServer()).get("/test-combined").set("Cookie", cookie);
    expect(before.status).toBe(403);

    const commercialRole = await prisma.role.findUniqueOrThrow({ where: { name: "COMMERCIAL" } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: commercialRole.id } });

    // Same cookie/access token as before - JwtAuthGuard re-resolves
    // roles/permissions from the database on every request rather than
    // trusting anything embedded in the token or cached from an earlier
    // request, so the very next call already reflects the newly granted
    // customers.read permission.
    const after = await request(app.getHttpServer()).get("/test-combined").set("Cookie", cookie);
    expect(after.status).toBe(200);
  });

  it("a permission revoked after the fact stops working on the very next request", async () => {
    const user = await createUserWithRoles(["FINANCE", "COMMERCIAL"]);
    const cookie = await cookieFor(user.id);

    const before = await request(app.getHttpServer()).get("/test-combined").set("Cookie", cookie);
    expect(before.status).toBe(200);

    const commercialRole = await prisma.role.findUniqueOrThrow({ where: { name: "COMMERCIAL" } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: user.id, roleId: commercialRole.id } } });

    const after = await request(app.getHttpServer()).get("/test-combined").set("Cookie", cookie);
    expect(after.status).toBe(403);
  });

  it("fails a step-up route closed until the server-side session has MFA and recent authentication", async () => {
    const user = await createUserWithRoles(["AUDITOR"]);
    const cookie = await cookieFor(user.id);

    const before = await request(app.getHttpServer()).get("/test-step-up").set("Cookie", cookie);
    expect(before.status).toBe(403);

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id, revokedAt: null } });
    await sessionService.markStepUpVerified(session.id, user.id);

    const after = await request(app.getHttpServer()).get("/test-step-up").set("Cookie", cookie);
    expect(after.status).toBe(200);
  });

  it("rejects a server-side step-up timestamp after the configured TTL expires", async () => {
    const user = await createUserWithRoles(["AUDITOR"]);
    const cookie = await cookieFor(user.id);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id, revokedAt: null } });
    const stale = new Date(Date.now() - 301_000);
    await prisma.session.update({
      where: { id: session.id },
      data: { mfaVerifiedAt: stale, recentAuthenticationAt: stale },
    });

    const response = await request(app.getHttpServer()).get("/test-step-up").set("Cookie", cookie);
    expect(response.status).toBe(403);
  });
});
