import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TokenService, parseDurationToMs } from "./token.service";
import { validateEnv } from "../../config/env.validation";

describe("parseDurationToMs", () => {
  it.each([
    ["15m", 15 * 60_000],
    ["7d", 7 * 86_400_000],
    ["30s", 30_000],
    ["1h", 3_600_000],
    ["500ms", 500],
    ["500", 500],
  ])("parses %s as %d ms", (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it("throws on a malformed duration string", () => {
    expect(() => parseDurationToMs("not-a-duration")).toThrow();
  });
});

/**
 * @nestjs/config reads process.env once, at the moment ConfigModule.forRoot
 * is evaluated, into an internal store - later mutating process.env has no
 * effect on an already-built ConfigService. Every test below that needs a
 * *different* env value therefore builds its own fresh TestingModule with
 * that value set first, and always restores the full previous
 * process.env afterwards (not just the one key it changed) so it can't
 * leak into other tests in this file - test-setup.ts's `??=` fallbacks
 * only run once per file, not before every test.
 */
async function buildTokenService(envOverrides: Record<string, string> = {}): Promise<TokenService> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: () => validateEnv({ ...process.env, ...envOverrides }) }),
      JwtModule.register({}),
    ],
    providers: [TokenService],
  }).compile();
  return moduleRef.get(TokenService);
}

describe("TokenService", () => {
  let service: TokenService;

  beforeEach(async () => {
    service = await buildTokenService();
  });

  it("signs and verifies an access token round-trip", () => {
    const token = service.signAccessToken({ sub: "user-1", sid: "session-1" });
    const payload = service.verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.sid).toBe("session-1");
  });

  it("rejects an expired access token", async () => {
    const shortLivedService = await buildTokenService({ JWT_ACCESS_TTL: "1ms" });
    const token = shortLivedService.signAccessToken({ sub: "user-1", sid: "session-1" });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(() => shortLivedService.verifyAccessToken(token)).toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = service.signAccessToken({ sub: "user-1", sid: "session-1" });

    const otherService = await buildTokenService({ JWT_SECRET: "a-completely-different-secret-value-16plus" });

    expect(() => otherService.verifyAccessToken(token)).toThrow();
  });

  it("generates a high-entropy, URL-safe refresh token", () => {
    const token = service.generateRefreshToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different refresh token on every call", () => {
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a).not.toBe(b);
  });

  it("hashes a refresh token deterministically (same input -> same hash)", () => {
    const token = service.generateRefreshToken();
    expect(service.hashRefreshToken(token)).toBe(service.hashRefreshToken(token));
  });

  it("never returns the raw token as (or embedded in) its own hash", () => {
    const token = service.generateRefreshToken();
    const hash = service.hashRefreshToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });

  it("produces a fixed-length hex digest regardless of token content", () => {
    const hash = service.hashRefreshToken(service.generateRefreshToken());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
