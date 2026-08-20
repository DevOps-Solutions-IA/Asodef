import { randomUUID } from "node:crypto";
import { Controller, Get } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { Secret, TOTP } from "otpauth";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { RequireStepUp } from "./decorators/require-step-up.decorator";
import { AdminMfaService } from "./mfa/admin-mfa.service";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

const ADMIN_EMAIL = "admin@asodef.com.co";
const PASSWORD = "Step-up-Integration-Password-99!";

@Controller("test-step-up-flow")
class StepUpFlowController {
  @RequireStepUp()
  @Get()
  read() {
    return { ok: true };
  }
}

describe("administrative step-up flow (integration, real HTTP and database)", () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let mfaService: AdminMfaService;
  let sessionService: SessionService;
  let tokenService: TokenService;
  let userId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [StepUpFlowController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    passwordService = moduleRef.get(PasswordService);
    mfaService = moduleRef.get(AdminMfaService);
    sessionService = moduleRef.get(SessionService);
    tokenService = moduleRef.get(TokenService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
    const user = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        recoveryEmail: "asodefsas@gmail.com",
        passwordHash: await passwordService.hash(PASSWORD),
        fullName: "Step-up Test Administrator",
        roles: { create: { roleId: role.id } },
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  afterAll(async () => moduleRef.close());

  it("returns 403 while stale, performs one password+factor ceremony, then passes without new cookies", async () => {
    const { session } = await sessionService.createSession(userId, { userAgent: "step-up-integration" });
    const enrollment = await mfaService.beginEnrollment(
      userId,
      session.id,
      PASSWORD,
      { requestId: randomUUID() },
    );
    await mfaService.confirmEnrollment(
      userId,
      session.id,
      PASSWORD,
      totp(enrollment.secret),
      { requestId: randomUUID() },
    );
    const accessToken = tokenService.signAccessToken({ sub: userId, sid: session.id });
    const cookie = `asodef_at=${accessToken}`;

    const stale = await request(app.getHttpServer()).get("/api/v1/test-step-up-flow").set("Cookie", cookie);
    expect(stale.status).toBe(403);

    const stepUp = await request(app.getHttpServer())
      .post("/api/v1/auth/step-up")
      .set("Cookie", cookie)
      .send({ password: PASSWORD, code: totp(enrollment.secret, Date.now() + 30_000) });
    expect(stepUp.status).toBe(200);
    expect(stepUp.body.verifiedAt).toBeDefined();
    expect(stepUp.headers["cache-control"]).toBe("no-store");
    expect(stepUp.headers["set-cookie"]).toBeUndefined();

    const allowed = await request(app.getHttpServer()).get("/api/v1/test-step-up-flow").set("Cookie", cookie);
    expect(allowed.status).toBe(200);

    await sessionService.revokeSession(session.id, "ADMIN_ACTION");
    const revoked = await request(app.getHttpServer())
      .post("/api/v1/auth/step-up")
      .set("Cookie", cookie)
      .send({ password: PASSWORD, code: totp(enrollment.secret, Date.now() + 60_000) });
    expect(revoked.status).toBe(401);
  });
});

function totp(secret: string, timestamp = Date.now()): string {
  return TOTP.generate({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    timestamp,
  });
}
