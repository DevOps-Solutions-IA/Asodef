import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { PasswordResetTokenService } from "./password-reset-token.service";
import { PrismaModule } from "../../database/prisma.module";
import { PrismaService } from "../../database/prisma.service";
import { validateEnv } from "../../config/env.validation";

describe("PasswordResetTokenService (integration, real Postgres)", () => {
  let moduleRef: TestingModule;
  let service: PasswordResetTokenService;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }), PrismaModule],
      providers: [PasswordResetTokenService],
    }).compile();

    service = moduleRef.get(PasswordResetTokenService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await moduleRef.close();
  });

  async function createUser() {
    const user = await prisma.user.create({
      data: { email: `test-${randomUUID()}@example.com`, passwordHash: "irrelevant-for-this-suite", fullName: "Test User" },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it("generates a URL-safe token with real entropy (never two calls the same)", () => {
    const a = service.generateToken();
    const b = service.generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 random bytes, base64url
  });

  it("hashes a token deterministically but never reveals the raw token in the hash", () => {
    const raw = service.generateToken();
    const hashA = service.hashToken(raw);
    const hashB = service.hashToken(raw);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toContain(raw);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/); // hex-encoded SHA-256 HMAC digest
  });

  it("creates a token row storing only the hash, never the raw token, with request metadata", async () => {
    const user = await createUser();
    const { passwordReset, rawToken } = await service.createToken(user.id, {
      ipAddress: "203.0.113.9",
      userAgent: "jest-agent",
      requestId: "req-1",
    });

    expect(passwordReset.tokenHash).not.toBe(rawToken);
    expect(passwordReset.tokenHash).not.toContain(rawToken);
    expect(passwordReset.requestIp).toBe("203.0.113.9");
    expect(passwordReset.userAgent).toBe("jest-agent");
    expect(passwordReset.requestId).toBe("req-1");
    expect(passwordReset.usedAt).toBeNull();
    expect(passwordReset.supersededAt).toBeNull();
    expect(passwordReset.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("finds a token by its raw value via the hash lookup", async () => {
    const user = await createUser();
    const { passwordReset, rawToken } = await service.createToken(user.id, {});

    const found = await service.findByRawToken(rawToken);
    expect(found?.id).toBe(passwordReset.id);
  });

  it("returns null for a raw token that was never issued", async () => {
    const found = await service.findByRawToken("never-issued-raw-token-value-xyz");
    expect(found).toBeNull();
  });

  it("supersedes every previous unused token for the user when a new one is requested", async () => {
    const user = await createUser();
    const first = await service.createToken(user.id, {});
    const second = await service.createToken(user.id, {});

    const refreshedFirst = await prisma.passwordReset.findUniqueOrThrow({ where: { id: first.passwordReset.id } });
    expect(refreshedFirst.supersededAt).not.toBeNull();

    const refreshedSecond = await prisma.passwordReset.findUniqueOrThrow({ where: { id: second.passwordReset.id } });
    expect(refreshedSecond.supersededAt).toBeNull();
    expect(service.isUsable(refreshedSecond)).toBe(true);
    expect(service.isUsable(refreshedFirst)).toBe(false);
  });

  it("claims a token exactly once - a second claim attempt fails", async () => {
    const user = await createUser();
    const { passwordReset } = await service.createToken(user.id, {});

    const firstClaim = await service.claim(passwordReset);
    const secondClaim = await service.claim(passwordReset);

    expect(firstClaim).toBe(true);
    expect(secondClaim).toBe(false);
  });

  it("does not let two concurrent claims of the same token both succeed", async () => {
    const user = await createUser();
    const { passwordReset } = await service.createToken(user.id, {});

    const [first, second] = await Promise.allSettled([service.claim(passwordReset), service.claim(passwordReset)]);

    const results = [first, second].map((r) => (r.status === "fulfilled" ? r.value : false));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("treats an expired, unused token as not usable", async () => {
    const user = await createUser();
    const { passwordReset } = await service.createToken(user.id, {});
    await prisma.passwordReset.update({ where: { id: passwordReset.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const expired = await prisma.passwordReset.findUniqueOrThrow({ where: { id: passwordReset.id } });
    expect(service.isUsable(expired)).toBe(false);
  });
});
