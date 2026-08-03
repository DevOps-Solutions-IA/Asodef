import { Body, Controller, Module, Post } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { IsEmail, IsString, MinLength } from "class-validator";
import request from "supertest";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap-app";
import { validateEnv } from "./config/env.validation";
import { PrismaService } from "./database/prisma.service";
import { RedisService } from "./common/redis/redis.service";

describe("Application bootstrap (integration, real env + real dependencies)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("boots successfully with a valid, complete environment", async () => {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    await expect(app.init()).resolves.not.toThrow();
    await app.close();
  });

  // NOTE ON APPROACH: AppModule's `imports: [ConfigModule.forRoot({... validate})]`
  // array is evaluated once, when app.module.ts's decorator metadata is first
  // built at import time - not re-run on every NestFactory.create(AppModule)
  // call. So mutating process.env *after* this file's top-level `import {
  // AppModule } from "./app.module"` has no effect on further create() calls
  // against that same cached class. Also, ConfigModule.forRoot() itself
  // doesn't run validate() synchronously - it only runs when Nest actually
  // instantiates the module. So each test below declares a *fresh* throwaway
  // @Module class (a new class expression, decorator-evaluated right then,
  // capturing whatever process.env is active at that exact moment) and
  // actually boots it via NestFactory.create() - this is the real integration
  // point that performs fail-fast validation. See
  // bootstrap.child-process.spec.ts for a true separate-process boot test.
  it("fails fast with a clear message when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })] })
    class ThrowawayModule {}

    await expect(NestFactory.create(ThrowawayModule, { logger: false, abortOnError: false })).rejects.toThrow(/DATABASE_URL/);
  });

  it("fails fast when JWT_SECRET is present but too short (invalid, not just missing)", async () => {
    process.env.JWT_SECRET = "too-short";

    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })] })
    class ThrowawayModule {}

    await expect(NestFactory.create(ThrowawayModule, { logger: false, abortOnError: false })).rejects.toThrow(/JWT_SECRET/);
  });

  it("never leaks the actual DATABASE_URL value in the startup failure message", async () => {
    process.env.DATABASE_URL = "not-a-valid-connection-string-but-should-never-appear-verbatim";

    @Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })] })
    class ThrowawayModule {}

    try {
      await NestFactory.create(ThrowawayModule, { logger: false, abortOnError: false });
      throw new Error("expected NestFactory.create to reject");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("not-a-valid-connection-string-but-should-never-appear-verbatim");
      expect(message).toContain("DATABASE_URL");
    }
  });

  it("gracefully closes the PrismaService and RedisService connections on shutdown", async () => {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    await app.init();

    const prisma = app.get(PrismaService);
    const redis = app.get(RedisService);

    const prismaDisconnectSpy = jest.spyOn(prisma, "$disconnect");
    const redisQuitSpy = jest.spyOn(redis.getClient(), "quit");

    await app.close();

    expect(prismaDisconnectSpy).toHaveBeenCalledTimes(1);
    expect(redisQuitSpy).toHaveBeenCalledTimes(1);
  });
});

// Throwaway module used only to prove the globally-configured ValidationPipe
// (whitelist + forbidNonWhitelisted + transform, wired in configureApp())
// actually rejects malformed input over real HTTP. Not part of the real
// application - no production route exists yet to exercise this against.
class ValidationTestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  fullName!: string;
}

@Controller("test-validation")
class ValidationTestController {
  @Post()
  create(@Body() dto: ValidationTestDto) {
    return { received: dto };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv })],
  controllers: [ValidationTestController],
})
class ValidationTestModule {}

describe("Global ValidationPipe (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(ValidationTestModule, { logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts a well-formed request", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test-validation")
      .send({ email: "user@example.com", fullName: "María Rojas" });

    expect(response.status).toBe(201);
  });

  it("rejects a request with an invalid email", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test-validation")
      .send({ email: "not-an-email", fullName: "María Rojas" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });

  it("rejects a request missing a required field", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test-validation")
      .send({ email: "user@example.com" });

    expect(response.status).toBe(400);
  });

  it("rejects a request containing fields not declared on the DTO (forbidNonWhitelisted)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test-validation")
      .send({ email: "user@example.com", fullName: "María Rojas", isAdmin: true });

    expect(response.status).toBe(400);
  });

  it("returns the consistent error envelope shape from the global exception filter", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/test-validation").send({});

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: "Bad Request",
      path: "/api/v1/test-validation",
    });
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.requestId).toBeDefined();
    expect(response.body.stack).toBeUndefined();
  });
});
